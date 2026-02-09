// backend/algorand-failover.mjs
import algosdk from 'algosdk';
import dotenv from 'dotenv';
dotenv.config();

/**
 * ------------------------------------------------------------------
 *  Configuración de endpoints Algorand con soporte para N nodos
 * ------------------------------------------------------------------
 * 
 * Soporta dos formatos:
 * 
 * Formato 1: Token global (todos los nodos comparten el mismo token)
 *   ALGOD_TOKEN=abc123
 *   ALGOD_ENDPOINTS=http://192.168.1.190:4001,http://192.168.1.189:4001
 * 
 * Formato 2: Token individual por nodo (cada nodo tiene su propio token)
 *   ALGOD_NODES=http://192.168.1.190:4001:token1,http://192.168.1.189:4001:token2
 * 
 * El Formato 2 tiene prioridad sobre el Formato 1
 */

const algodNodes = [];

// Parsear formato 2 (preferido): URL:TOKEN por cada nodo
if (process.env.ALGOD_NODES) {
  const nodes = process.env.ALGOD_NODES.split(',').map(s => s.trim()).filter(Boolean);
  for (const node of nodes) {
    const parts = node.split(':');
    // Esperamos formato: http://IP:PORT:TOKEN o https://IP:PORT:TOKEN
    if (parts.length >= 4) {
      // Caso: http://192.168.1.190:4001:token123
      const protocol = parts[0]; // http o https
      const ip = parts[1].replace(/^\/\//, ''); // quitar //
      const port = parts[2];
      const token = parts.slice(3).join(':'); // por si el token tiene ":"
      
      const url = `${protocol}://${ip}:${port}`;
      algodNodes.push({ url, token, port: Number(port) });
      console.log(`[ALGOD-Config] ✅ Nodo: ${url} (token individual)`);
    } else if (parts.length === 3) {
      // Caso: URL:PORT:TOKEN donde URL no tiene protocolo
      console.warn(`[ALGOD-Config] ⚠️  Formato ambiguo: ${node} - asumiendo http://${parts[0]}:${parts[1]}`);
      const url = `http://${parts[0]}:${parts[1]}`;
      algodNodes.push({ url, token: parts[2], port: Number(parts[1]) });
    }
  }
}

// Parsear formato 1 (fallback): Token global + múltiples URLs
if (algodNodes.length === 0) {
  const globalToken = process.env.ALGOD_TOKEN || '';
  const endpoints = (
    process.env.ALGOD_ENDPOINTS ||
    process.env.ALGOD_URL ||
    'http://127.0.0.1:4001'
  )
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  for (const endpoint of endpoints) {
    try {
      const u = new URL(endpoint);
      const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 4001);
      algodNodes.push({ 
        url: endpoint, 
        token: globalToken, 
        port 
      });
      console.log(`[ALGOD-Config] ✅ Nodo: ${endpoint} (token global)`);
    } catch (e) {
      console.error(`[ALGOD-Config] ❌ URL inválida: ${endpoint}`);
    }
  }
}

// Validación
if (algodNodes.length === 0) {
  console.warn('[ALGOD-Config] ⚠️  No hay nodos configurados, usando http://127.0.0.1:4001 sin token');
  algodNodes.push({ 
    url: 'http://127.0.0.1:4001', 
    token: '', 
    port: 4001 
  });
}

console.log(`[ALGOD-Config] Total de ${algodNodes.length} nodo(s) Algorand configurado(s)`);

// ---------- INDEXER endpoints ----------
const indexerNodes = [];

if (process.env.INDEXER_NODES) {
  // Formato con tokens individuales (si fuera necesario en el futuro)
  const nodes = process.env.INDEXER_NODES.split(',').map(s => s.trim()).filter(Boolean);
  for (const node of nodes) {
    const [url, token = ''] = node.split('::'); // separador :: para distinguir de :
    indexerNodes.push({ url, token });
  }
} else {
  // Formato simple (sin tokens, típico para indexers públicos)
  const endpoints = (
    process.env.INDEXER_URLS ||
    process.env.INDEXER_URL ||
    'https://mainnet-idx.algonode.cloud'
  )
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  for (const endpoint of endpoints) {
    indexerNodes.push({ url: endpoint, token: '' });
  }
}

console.log(`[INDEXER-Config] Total de ${indexerNodes.length} indexer(s) configurado(s)`);

/**
 * Crea un cliente Algod para un nodo específico
 */
function createAlgodClient(node) {
  const { url, token, port } = node;
  return new algosdk.Algodv2(token, url, port);
}

/**
 * Crea un cliente Indexer para un nodo específico
 */
function createIndexerClient(node) {
  const { url, token } = node;
  return new algosdk.Indexer(token, url, '');
}

/* ------------------------------------------------------------------
 *  Cliente genérico con failover para ALGOD
 * ------------------------------------------------------------------ */

/**
 * Ejecuta una operación Algod con failover automático a través de N nodos.
 * Similar a withIpfs() en indexing.mjs
 * 
 * @param {Function} fn - Función async que recibe (client, nodeInfo)
 * @returns {Promise} - Resultado de la operación
 */
async function withAlgod(fn) {
  let lastErr;
  for (const node of algodNodes) {
    try {
      const client = createAlgodClient(node);
      const result = await fn(client, node);
      return result;
    } catch (e) {
      lastErr = e;
      console.error('[ALGOD-Failover] ❌ Nodo falló:', node.url, '-', e?.message || String(e));
    }
  }
  throw lastErr || new Error('Todos los nodos ALGOD fallaron');
}

/**
 * Ejecuta una operación Indexer con failover automático
 */
async function withIndexer(fn) {
  let lastErr;
  for (const node of indexerNodes) {
    try {
      const client = createIndexerClient(node);
      const result = await fn(client, node);
      return result;
    } catch (e) {
      lastErr = e;
      console.error('[INDEXER-Failover] ❌ Indexer falló:', node.url, '-', e?.message || String(e));
    }
  }
  throw lastErr || new Error('Todos los indexers fallaron');
}

/* ------------------------------------------------------------------
 *  Cliente sticky (persistente) para operaciones que requieren
 *  mantener la misma sesión (como waitForConfirmation)
 * ------------------------------------------------------------------ */

let currentStickyNode = null;  // { client, node }

/**
 * Obtiene o selecciona un cliente Algod "sticky" que se mantiene
 * hasta que falle. Similar a getWriter() en indexing.mjs
 */
async function getStickyAlgodClient() {
  // Si ya tenemos un cliente sticky, verificar que siga vivo
  if (currentStickyNode) {
    try {
      await currentStickyNode.client.healthCheck().do();
      return currentStickyNode;
    } catch (e) {
      console.warn(
        '[ALGOD-Sticky] ⚠️  Nodo sticky cayó:', 
        currentStickyNode.node.url, 
        '-', 
        e?.message || String(e)
      );
      currentStickyNode = null;
    }
  }

  // Buscar un nuevo nodo disponible
  let lastErr;
  for (const node of algodNodes) {
    try {
      const client = createAlgodClient(node);
      await client.healthCheck().do();
      currentStickyNode = { client, node };
      console.log('[ALGOD-Sticky] ✅ Usando nodo:', node.url);
      return currentStickyNode;
    } catch (e) {
      lastErr = e;
      console.warn('[ALGOD-Sticky] ⚠️  Nodo no disponible:', node.url, '-', e?.message || String(e));
    }
  }
  
  throw lastErr || new Error('No hay nodos ALGOD disponibles para cliente sticky');
}

/**
 * Resetea el cliente sticky (útil cuando cambias de contexto)
 */
function resetStickyClient() {
  currentStickyNode = null;
  console.log('[ALGOD-Sticky] 🔄 Cliente sticky reseteado');
}

/* ------------------------------------------------------------------
 *  Helpers de alto nivel con failover
 * ------------------------------------------------------------------ */

/**
 * Obtiene los parámetros de transacción con failover
 */
async function getTransactionParams() {
  return withAlgod(async (client, node) => {
    const params = await client.getTransactionParams().do();
    console.log('[ALGOD] ✅ Parámetros obtenidos de:', node.url);
    return params;
  });
}

/**
 * Construye suggestedParams con CAP de 1000 rondas (recomendado)
 */
async function buildSuggestedParams() {
  const p = await getTransactionParams();
  const first = Number(p.firstRound ?? p['first-round']);
  const last = first + 1000; // CAP recomendado

  return {
    fee: Number(p.minFee ?? p.fee ?? 1000),
    flatFee: true,
    firstRound: first,
    lastRound: last,
    genesisHash: p.genesisHash ?? p['genesis-hash'],
    genesisID: p.genesisID ?? p['genesis-id'],
  };
}

/**
 * Envía una transacción firmada con failover
 * Intenta broadcast automáticamente en N nodos si es necesario
 */
async function sendRawTransaction(signedTxn) {
  return withAlgod(async (client, node) => {
    const result = await client.sendRawTransaction(signedTxn).do();
    console.log('[ALGOD] ✅ Tx enviada via:', node.url, '- txId:', result.txId);
    return result;
  });
}

/**
 * Espera confirmación de una transacción
 * Usa el cliente sticky para mantener la sesión y evita problemas de round sync
 * Si el nodo sticky falla durante la espera, cambia automáticamente a otro
 */
async function waitForConfirmation(txId, timeout = 20) {
  const startTime = Date.now();
  let remainingTimeout = timeout;

  while (remainingTimeout > 0) {
    try {
      const { client, node } = await getStickyAlgodClient();
      const start = Date.now();
      let lastRound = (await client.status().do())['last-round'];

      console.log('[ALGOD-Confirm] ⏳ Esperando confirmación de', txId, 'en', node.url);

      while ((Date.now() - start) / 1000 < remainingTimeout) {
        const p = await client.pendingTransactionInformation(txId).do();
        
        if (p['pool-error'] && p['pool-error'].length > 0) {
          console.error('[ALGOD-Confirm] ❌ Pool error:', p['pool-error']);
          return { ...p, __rejected: true };
        }
        
        const confirmedRound = p['confirmed-round'] || 0;
        if (confirmedRound > 0) {
          console.log('[ALGOD-Confirm] ✅ Confirmada en round', confirmedRound, 'via', node.url);
          return p;
        }
        
        lastRound += 1;
        await client.statusAfterBlock(lastRound).do();
      }

      // Timeout alcanzado
      return { __timeout: true };

    } catch (e) {
      console.warn(
        '[ALGOD-Confirm] ⚠️  Error durante confirmación:', 
        e?.message || String(e),
        '- intentando otro nodo...'
      );
      
      // Resetear sticky client para que getStickyAlgodClient() elija otro
      resetStickyClient();
      
      // Calcular tiempo restante
      remainingTimeout = timeout - (Date.now() - startTime) / 1000;
      
      if (remainingTimeout <= 0) {
        return { __timeout: true };
      }
      
      // Continuar loop con el nuevo nodo
    }
  }

  return { __timeout: true };
}

/**
 * Health check con failover (devuelve info del primer nodo que responda)
 */
async function healthCheck() {
  return withAlgod(async (client, node) => {
    await client.healthCheck().do();
    console.log('[ALGOD-Health] ✅ Nodo saludable:', node.url);
    return { ok: true, endpoint: node.url };
  });
}

/**
 * Obtiene el status del nodo con failover
 */
async function getStatus() {
  return withAlgod(async (client, node) => {
    const status = await client.status().do();
    console.log('[ALGOD-Status] ✅ Status obtenido de:', node.url);
    return status;
  });
}

/**
 * Obtiene info de transacción pendiente con failover
 */
async function getPendingTransactionInfo(txId) {
  return withAlgod(async (client, node) => {
    const info = await client.pendingTransactionInformation(txId).do();
    console.log('[ALGOD-PendingTx] ✅ Info obtenida de:', node.url);
    return info;
  });
}

/**
 * Lookup de transacción via Indexer con failover
 */
async function lookupTransactionByID(txId) {
  return withIndexer(async (client, node) => {
    const result = await client.lookupTransactionByID(txId).do();
    console.log('[INDEXER] ✅ Transacción encontrada via:', node.url);
    return result;
  });
}

/**
 * Search transactions via Indexer con failover
 */
async function searchTransactions(params) {
  return withIndexer(async (client, node) => {
    let query = client.searchForTransactions();
    
    if (params.address) query = query.address(params.address);
    if (params.notePrefix) query = query.notePrefix(params.notePrefix);
    if (params.minRound) query = query.minRound(params.minRound);
    if (params.maxRound) query = query.maxRound(params.maxRound);
    if (params.limit) query = query.limit(params.limit);
    
    const result = await query.do();
    console.log('[INDEXER] ✅ Búsqueda completada via:', node.url);
    return result;
  });
}

/**
 * Health check del indexer con failover
 */
async function indexerHealthCheck() {
  return withIndexer(async (client, node) => {
    const health = await client.makeHealthCheck().do();
    console.log('[INDEXER-Health] ✅ Indexer saludable:', node.url);
    return { ok: true, endpoint: node.url, ...health };
  });
}

/* ------------------------------------------------------------------
 *  Información y diagnóstico
 * ------------------------------------------------------------------ */

/**
 * Devuelve info de todos los nodos configurados
 */
function getNodesInfo() {
  return {
    algodNodes: algodNodes.map(n => ({ 
      url: n.url, 
      hasToken: !!n.token,
      port: n.port 
    })),
    indexerNodes: indexerNodes.map(n => ({ 
      url: n.url, 
      hasToken: !!n.token 
    })),
    currentSticky: currentStickyNode ? {
      url: currentStickyNode.node.url,
      active: true
    } : null
  };
}

/**
 * Prueba todos los nodos y devuelve cuáles están disponibles
 */
async function diagnoseNodes() {
  const results = {
    algod: [],
    indexer: []
  };

  // Probar nodos Algod
  for (const node of algodNodes) {
    try {
      const client = createAlgodClient(node);
      await client.healthCheck().do();
      const status = await client.status().do();
      results.algod.push({
        url: node.url,
        status: 'healthy',
        lastRound: status['last-round'],
        catchingUp: status['catchup-time'] > 0
      });
    } catch (e) {
      results.algod.push({
        url: node.url,
        status: 'error',
        error: e?.message || String(e)
      });
    }
  }

  // Probar indexers
  for (const node of indexerNodes) {
    try {
      const client = createIndexerClient(node);
      await client.makeHealthCheck().do();
      results.indexer.push({
        url: node.url,
        status: 'healthy'
      });
    } catch (e) {
      results.indexer.push({
        url: node.url,
        status: 'error',
        error: e?.message || String(e)
      });
    }
  }

  return results;
}

/* ------------------------------------------------------------------
 *  Exports
 * ------------------------------------------------------------------ */

export {
  // Core failover functions
  withAlgod,
  withIndexer,
  getStickyAlgodClient,
  resetStickyClient,
  
  // High-level operations
  getTransactionParams,
  buildSuggestedParams,
  sendRawTransaction,
  waitForConfirmation,
  healthCheck,
  getStatus,
  getPendingTransactionInfo,
  lookupTransactionByID,
  searchTransactions,
  indexerHealthCheck,
  
  // Info & diagnostics
  getNodesInfo,
  diagnoseNodes,
  
  // Node configurations (read-only)
  algodNodes,
  indexerNodes
};

// Cliente por defecto para compatibilidad (usa el primer nodo)
export const algodClient = createAlgodClient(algodNodes[0]);
export const indexerClient = createIndexerClient(indexerNodes[0]);

export default {
  withAlgod,
  withIndexer,
  getStickyAlgodClient,
  getTransactionParams,
  sendRawTransaction,
  waitForConfirmation,
  healthCheck,
  getNodesInfo,
  diagnoseNodes
};
