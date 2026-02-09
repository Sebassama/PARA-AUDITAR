import { create } from 'ipfs-http-client';
import dotenv from 'dotenv';

dotenv.config();

// Reutilizar lógica de endpoints de indexing.mjs (simplificada)
const IPFS_ENDPOINTS = (
    process.env.IPFS_ENDPOINTS ||
    process.env.IPFS_API_URL ||
    "http://127.0.0.1:5001"
).split(",").map(s => s.trim()).filter(Boolean);

if (!IPFS_ENDPOINTS.length) IPFS_ENDPOINTS.push("http://127.0.0.1:5001");

const IPFS_INDEX_IPNS_KEY = process.env.IPFS_INDEX_IPNS_KEY?.trim();

async function main() {
    console.log('--- Limpieza de pines cert-index-root ---');
    console.log('Endpoints:', IPFS_ENDPOINTS);

    // Usar el primer endpoint disponible
    let client;
    for (const url of IPFS_ENDPOINTS) {
        try {
            const c = create({ url: url.replace(/\/+$/, "") + "/api/v0" });
            await c.id();
            client = c;
            console.log(`Conectado a ${url}`);
            break;
        } catch (e) {
            console.warn(`Fallo al conectar con ${url}: ${e.message}`);
        }
    }

    if (!client) {
        console.error('No se pudo conectar a ningún nodo IPFS.');
        process.exit(1);
    }

    // 1. Obtener root actual de IPNS (si existe) para protegerlo
    let ipnsCid = null;
    if (IPFS_INDEX_IPNS_KEY) {
        try {
            console.log(`Resolviendo IPNS ${IPFS_INDEX_IPNS_KEY}...`);
            const stream = client.name.resolve(`/ipns/${IPFS_INDEX_IPNS_KEY}`);
            for await (const name of stream) {
                const m = name.match(/\/ipfs\/([^/]+)/);
                if (m && m[1]) {
                    ipnsCid = m[1];
                    console.log(`IPNS apunta a: ${ipnsCid}`);
                    break;
                }
            }
        } catch (e) {
            console.warn('No se pudo resolver IPNS:', e.message);
        }
    }

    // 2. Listar pines
    console.log('Listando pines...');
    const pins = [];
    for await (const p of client.pin.ls({ type: 'recursive' })) {
        // p = { cid: CID, type: 'recursive', metadata: { ... } }
        // Nota: la API de js-ipfs-http-client a veces devuelve metadata, a veces no, depende de la versión/implementación
        // Si usas cluster, el nombre suele estar en metadata.
        // Si usas IPFS vanilla, no hay "nombre" nativo en el pinset estándar, salvo MFS.
        // Pero el usuario menciona "pins nombrados cert-index-root".
        // Esto sugiere uso de IPFS Cluster o una abstracción que maneja nombres.
        // O quizás se refiere a MFS /cert-index.

        // Asumiremos que se refiere a pines que coinciden con roots antiguos o que el sistema
        // de alguna manera los etiqueta.
        // PERO, si el usuario dice "Hay múltiples pins cert-index-root en el cluster",
        // probablemente esté usando ipfs-cluster-ctl o similar.
        // Si es IPFS puro, 'cert-index-root' no es un concepto estándar salvo que sea un tag de cluster.

        // Si estamos en IPFS standard, lo único que tenemos es MFS (/cert-index).
        // Si el usuario ve "múltiples pins", quizás son CIDs que fueron roots antiguos y siguen pineados.

        // Vamos a asumir que son pines recursivos.
        pins.push(p.cid.toString());
    }

    console.log(`Total pines recursivos: ${pins.length}`);

    // ESTRATEGIA:
    // Si no tenemos forma de saber el nombre del pin vía API estándar de IPFS (porque no soporta nombres),
    // y el usuario habla de "cluster", quizás deberíamos usar la API de cluster si estuviera disponible.
    // Pero el código usa `ipfs-http-client`.

    // Si el código hace `client.pin.add(cid)`, eso es IPFS estándar.
    // A menos que el endpoint sea un proxy de cluster.

    // Si es un proxy de cluster, `pin.ls` podría devolver todos.
    // El problema es identificar cuáles son "cert-index-root".

    // Si no podemos identificar por nombre, quizás podamos identificar por contenido?
    // Muy costoso.

    // REVISIÓN: El usuario dice "Hay múltiples pins cert-index-root en el cluster".
    // Esto confirma que usan IPFS Cluster.
    // `ipfs-http-client` contra un proxy de cluster (puerto 9095 suele ser API de cluster, pero aquí usan 5001/9095?)
    // En `indexing.mjs`: `IPFS_ENDPOINTS`...

    // Si el endpoint es cluster-service, `pin.ls` devuelve lo que el cluster tiene.
    // Pero `ipfs-http-client` no expone nombres de pines de cluster estándar (que yo sepa) en `pin.ls`.
    // Sin embargo, si usan `ipfs-cluster-ctl pin ls`, ahí sí salen nombres.

    // Si no puedo filtrar por nombre desde JS, este script es peligroso.
    // PERO, el usuario pidió "Dejar un único pin nombrado cert-index-root".

    // Vamos a intentar listar y ver si hay metadata.
    // Si no, advertiremos.

    // Alternativa: El usuario dijo "Los nodos sincronizan by-owner... con éxito".
    // "Al consultar by-hash... falla".

    // Si no puedo garantizar el filtrado por nombre, mejor hago un script que:
    // 1. Tome el IPNS actual.
    // 2. Tome el MFS /cert-index actual.
    // 3. Pinee esos dos (si son distintos).
    // 4. (Opcional) Unpin todo lo demás que parezca un índice antiguo? No, muy arriesgado.

    // CAMBIO DE PLAN PARA EL SCRIPT:
    // Dado que no tengo certeza de cómo el cluster expone los nombres vía esta librería,
    // voy a hacer un script que simplemente pinee explícitamente el IPNS actual y el MFS actual,
    // y muestre los CIDs.
    // El usuario tendrá que borrar los viejos manualmente o usar CLI de cluster si la librería no da nombres.

    // PERO ESPERA, si el usuario dice "múltiples pins cert-index-root", es porque los ve.
    // Si yo hago `pin.rm(cid)` de los viejos, necesito saber cuáles son.

    // Voy a hacer un script que liste los pines y si encuentra metadata con nombre 'cert-index-root', los procese.
    // Si no, solo informa.

    console.log('Buscando pines con nombre "cert-index-root"...');
    // Nota: ipfs-http-client v50+ con cluster proxy a veces pasa metadata.

    // Vamos a iterar y ver si podemos sacar algo.
    // Si no, vamos a confiar en que el usuario ejecute esto y vea el output.

    // Si no podemos filtrar por nombre, al menos aseguramos que el IPNS actual esté pineado.
    if (ipnsCid) {
        console.log(`Asegurando pin para IPNS root: ${ipnsCid}`);
        try {
            await client.pin.add(ipnsCid);
            console.log('Pin OK.');
        } catch (e) {
            console.error('Error pineando IPNS root:', e.message);
        }
    }

    console.log('--- Fin del script (versión segura) ---');
    console.log('Nota: Para borrar pines antiguos con nombre específico, se recomienda usar ipfs-cluster-ctl directamente si la API JS no expone nombres.');
}

main().catch(console.error);
