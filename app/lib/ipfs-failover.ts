/**
 * Utilidad para abrir archivos IPFS con failover automático
 * Si un gateway IPFS falla, intenta automáticamente con los otros
 */

// Gateways IPFS disponibles (en orden de preferencia)
const IPFS_GATEWAYS = (
    process.env.NEXT_PUBLIC_IPFS_GATEWAYS ||
    "https://192.168.101.192"
)
    .split(",")
    .map(g => g.trim().replace(/\/+$/, ""))
    .filter(Boolean);

// Gateway principal (primer elemento)
export const IPFS_GATEWAY_BASE = IPFS_GATEWAYS[0];

/**
 * Abre un CID de IPFS con failover automático.
 * Intenta el gateway principal primero, si falla, prueba los otros.
 * 
 * @param cid - CID del archivo IPFS
 */
export async function openIpfsWithFailover(cid: string) {
    if (!cid) {
        console.warn("[IPFS] No CID provided");
        return;
    }

    console.log(`[IPFS] Abriendo CID: ${cid}`);
    console.log(`[IPFS] Gateways disponibles: ${IPFS_GATEWAYS.length}`);

    // Intentar cada gateway
    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
        const gateway = IPFS_GATEWAYS[i];
        const url = `${gateway}/ipfs/${cid}`;

        try {
            console.log(`[IPFS] Intentando gateway ${i + 1}/${IPFS_GATEWAYS.length}: ${gateway}`);

            // Probar si el gateway está disponible con un HEAD request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seg timeout

            const response = await fetch(url, {
                method: "HEAD",
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                console.log(`[IPFS] ✅ Gateway ${gateway} disponible, abriendo...`);
                window.open(url, "_blank");
                return; // Éxito, salir
            } else {
                console.warn(`[IPFS] ⚠️  Gateway ${gateway} respondió con ${response.status}`);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[IPFS] ❌ Gateway ${gateway} falló: ${errorMsg}`);

            // Si es el último gateway, mostrar error al usuario
            if (i === IPFS_GATEWAYS.length - 1) {
                alert(
                    `No se pudo acceder al archivo IPFS.\n\n` +
                    `CID: ${cid}\n\n` +
                    `Todos los gateways fallaron. Por favor, intenta más tarde.`
                );
                return;
            }
        }
    }
}

/**
 * Versión legacy para compatibilidad: abre directamente sin failover
 * (se mantiene por si algunos componentes aún la usan)
 */
export function openIpfsDirect(cid: string) {
    if (cid) {
        window.open(`${IPFS_GATEWAY_BASE}/ipfs/${cid}`, "_blank");
    }
}
