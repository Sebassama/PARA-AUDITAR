/**
 * Descarga PDFs directamente desde gateways IPFS con failover
 */

// Backend local (para obtener metadata si es necesario)
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

// Gateways IPFS (para descargar PDFs)
const IPFS_GATEWAYS = (
    process.env.NEXT_PUBLIC_IPFS_GATEWAYS ||
    "https://192.168.101.192"
)
    .split(",")
    .map(g => g.trim().replace(/\/+$/, ""))
    .filter(Boolean);

/**
 * Descarga PDF directamente desde IPFS usando el CID.
 * Intenta todos los gateways hasta que uno funcione.
 * 
 * @param cid - CID del archivo en IPFS
 * @param filename - Nombre del archivo (opcional)
 */
export async function downloadFromIPFS(cid: string, filename?: string) {
    if (!cid) {
        alert('CID no válido');
        return;
    }

    console.log(`[IPFS Download] CID: ${cid}`);
    console.log(`[IPFS Download] Gateways: ${IPFS_GATEWAYS.length}`);

    const downloadFilename = filename || `certificado-${cid.substring(0, 8)}.pdf`;

    for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
        const gateway = IPFS_GATEWAYS[i];
        const ipfsUrl = `${gateway}/ipfs/${cid}`;

        try {
            console.log(`[IPFS] ${i + 1}/${IPFS_GATEWAYS.length} - ${gateway}`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(ipfsUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Descargar blob
            const blob = await response.blob();

            // Crear descarga
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = downloadFilename;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(blobUrl);
            }, 100);

            console.log(`[IPFS] ✅ Descarga exitosa desde ${gateway}`);
            return;

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[IPFS] ❌ ${gateway} falló: ${msg}`);

            if (i === IPFS_GATEWAYS.length - 1) {
                alert(
                    `No se pudo descargar desde ningún gateway IPFS.\n\n` +
                    `CID: ${cid}\n` +
                    `Gateways probados: ${IPFS_GATEWAYS.length}`
                );
            }
        }
    }
}

/**
 * Descarga PDF. Si tiene CID usa descarga directa, sino busca el CID primero.
 * 
 * @param pathOrCid - Path del backend o CID directo
 * @param cid - CID opcional (si ya lo tienes)
 */
export async function downloadWithFailover(pathOrCid: string, cid?: string) {
    // Si se proporciona CID, descargar directamente
    if (cid) {
        return downloadFromIPFS(cid);
    }

    // Si parece un CID (empieza con Qm o bafy), descargar directamente
    if (pathOrCid.match(/^(Qm|bafy)/)) {
        return downloadFromIPFS(pathOrCid);
    }

    // Sino, es un path - extraer hash y buscar CID
    const hash = pathOrCid.split('/').pop()?.trim();

    if (!hash) {
        alert('Hash no válido');
        return;
    }

    console.log(`[Download] Hash: ${hash}`);

    // Obtener CID desde backend
    let pdfCid: string | null = null;

    try {
        console.log(`[Backend] Obteniendo CID...`);

        const response = await fetch(`${API_BASE}/api/index/search-hash?hash=${hash}`, {
            signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
            const data = await response.json();
            pdfCid = data?.meta?.pdf_cid || data?.pdf_cid || null;

            if (pdfCid) {
                console.log(`[Backend] ✅ CID: ${pdfCid}`);
            }
        }
    } catch (error) {
        console.warn(`[Backend] Error:`, error);
    }

    if (!pdfCid) {
        alert(`No se pudo obtener el CID del archivo.\n\nHash: ${hash}`);
        return;
    }

    // Descargar usando el CID
    return downloadFromIPFS(pdfCid, `cert-${hash.substring(0, 8)}.pdf`);
}

/**
 * Fetch normal al backend local
 */
export async function fetchWithFailover(path: string, options?: RequestInit): Promise<Response> {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${API_BASE}${cleanPath}`;

    console.log(`[Fetch] ${url}`);
    return fetch(url, options);
}
