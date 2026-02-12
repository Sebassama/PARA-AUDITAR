// index.mjs
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken'; // PARA TOKENSWEB
import authRoutes from './auth-routes.mjs'; //agregado oauth admin secre y grupos
import fs from 'fs';
import pool from './db.mjs';
import algosdk from 'algosdk';
import { create as createIpfsClient } from 'ipfs-http-client';

// Helper: crear cliente IPFS (AGREGAR SI NO EXISTE)
function createClient(baseUrl) {
  const url = baseUrl.replace(/\/+$/, "") + "/api/v0";
  return createIpfsClient({ url });
}

// --- IPFS helpers e índice ---
import ipfs, {
  normalizeOwnerName, shardPrefix, keyPrefixFromOwner,
  ensureMfsDirs, mfsReadJsonOrNull, mfsWriteJson, mfsMove,
  getRootCid, publishIndexRoot, catWithFailover,
  IPFS_ENDPOINTS
} from './indexing.mjs';

import {
  getStickyAlgodClient,
  lookupTransactionByID,
  indexerHealthCheck,
  sendRawTransaction,
  buildSuggestedParams as buildSuggestedParamsFailover,
  waitForConfirmation as waitForConfirmationFailover,
  // New imports for full HA
  healthCheck as algodHealthCheck,
  getStatus as algodGetStatus,
  getPendingTransactionInfo as algodGetPendingTx,
  getTransactionParams as algodGetParams
} from './algorand-failover.mjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

const IPFS_GATEWAY_URL = (process.env.IPFS_GATEWAY_URL || 'http://192.168.1.45:8080').replace(/\/+$/, '');
const INDEXER_URL = (process.env.INDEXER_URL || 'https://mainnet-idx.algonode.cloud').replace(/\/+$/, '');

const toJSONSafe = (x) =>
  JSON.parse(JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));

// ---------- ALGOD client ----------
// Preferir primer nodo de ALGOD_NODES como URL/token por defecto
let ALGOD_URL = process.env.ALGOD_URL || '';
let ALGOD_TOKEN = process.env.ALGOD_TOKEN || '';

if (!ALGOD_URL && process.env.ALGOD_NODES) {
  const firstNode = process.env.ALGOD_NODES.split(',').map(s => s.trim()).filter(Boolean)[0];
  if (firstNode) {
    // Formatos soportados:
    // - http://ip:port:token
    // - http://ip:port (sin token)
    const parts = firstNode.split(':');
    if (parts.length >= 4) {
      // http:// ip port token...
      const protocol = parts[0]; // http
      const host = parts[1].replace(/^\/\//, ''); // //192.168...
      const port = parts[2];
      const token = parts.slice(3).join(':');
      ALGOD_URL = `${protocol}://${host}:${port}`;
      ALGOD_TOKEN = token;
    } else {
      ALGOD_URL = firstNode;
    }
  }
}

if (!ALGOD_URL) ALGOD_URL = 'http://127.0.0.1:4001';

const u = new URL(ALGOD_URL);
const ALGOD_PORT = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 4001);

const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, ALGOD_PORT);
const MNEMONIC = (process.env.ALGOD_MNEMONIC || '').trim();

let serverAcct = null;
if (MNEMONIC) {
  try {
    const words = MNEMONIC.split(/\s+/).filter(Boolean);
    if (words.length === 25) {
      const account = algosdk.mnemonicToSecretKey(words.join(' '));
      if (algosdk.isValidAddress(account.addr)) {
        serverAcct = account;
        console.log(`[Signer] ✅ Cuenta: ${serverAcct.addr}`);
      } else {
        console.warn('[Signer] Dirección inválida derivada del mnemónico');
      }
    } else {
      console.warn(`[Signer] MNEMONIC inválido: ${words.length} palabras (se esperan 25)`);
    }
  } catch (e) {
    console.error('[Signer] Error leyendo mnemónico:', e.message);
  }
} else {
  console.warn('[ANCHOR] Falta ALGOD_MNEMONIC; /api/algod/anchorNote* deshabilitado');
}

// Ventanas de búsqueda (solo para indexer por hash)
const IDX_LOOKBACK_HOURS = Math.max(1, Number(process.env.IDX_LOOKBACK_HOURS || '1'));
const IDX_AHEAD_HOURS = Math.max(0, Number(process.env.IDX_AHEAD_HOURS || '1'));

// ---------- INDEXER client (SDK) ----------
// const indexerClient = new algosdk.Indexer('', INDEXER_URL, '');
// console.log('[INDEXER_URL]', INDEXER_URL);

// ---------- Middlewares ----------
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rutas de autenticación Microsoft OAuth Usuarios
app.use(authRoutes);

console.log('✅ Rutas de autenticación Microsoft OAuth configuradas para usuarios');

// 🆕 Rutas de autenticación pública (solo email, sin wallet)
import publicAuthRoutes from './public-auth.mjs';
app.use('/api/auth/public', publicAuthRoutes);
console.log('✅ Rutas de autenticación pública configuradas');


// Middleware para extraer usuario autenticado (opcional para rutas protegidas)
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // { wallet, email, role }
    } catch (err) {
      // Token inválido o expirado, continuar sin usuario
    }
  }
  next();
});


// Cliente local que ya tienes
// const algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_URL, ALGOD_PORT);

// (OPCIONAL) Fallback sólo para broadcast si el local falla
const FALLBACK_ALGOD_URL = process.env.FALLBACK_ALGOD_URL || 'https://mainnet-api.algonode.cloud';
const fallbackAlgod = new algosdk.Algodv2('', FALLBACK_ALGOD_URL, '');

async function sendAndConfirm({ to, amount = 0, note }, signer, { confirmWith = 'local', timeout = 20 } = {}) {
  // 1) params con CAP
  const sp = await buildSuggestedParams(algodClient);

  // 2) construir txn
  const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    from: signer.addr,
    to,
    amount,
    note,
    suggestedParams: sp,
  });

  // 3) firmar
  const stxn = txn.signTxn(signer.sk);

  // 4) broadcast (local → fallback)
  let txId;
  try {
    const rLocal = await algodClient.sendRawTransaction(stxn).do();
    txId = rLocal.txId;
  } catch (eLocal) {
    // si el local falla para enviar, probar fallback (solo broadcast)
    const rFb = await fallbackAlgod.sendRawTransaction(stxn).do();
    txId = rFb.txId;
  }

  // 5) confirmación (local, y si no, fallback)
  let confirmed = await waitForConfirmation(
    confirmWith === 'fallback' ? fallbackAlgod : algodClient,
    txId,
    timeout
  ).catch(() => null);

  if (!confirmed || confirmed.__timeout) {
    // intenta confirmar contra fallback si el local no devolvió a tiempo
    confirmed = await waitForConfirmation(fallbackAlgod, txId, timeout).catch(() => confirmed);
  }

  return { txId, confirmed };
}

// ---------- Confirmación con preferencia ALGOD y fallback INDEXER ----------
// ---------- Confirmación con preferencia ALGOD y fallback INDEXER ----------
async function confirmRoundWithFallback({ txId, waitSeconds = 12 }) {
  // 1) ALGOD (sticky failover)
  try {
    const { client: algod } = await getStickyAlgodClient();
    const start = Date.now();
    let lastRound = (await algod.status().do())['last-round'];
    while ((Date.now() - start) / 1000 < waitSeconds) {
      const p = await algod.pendingTransactionInformation(txId).do();
      const cr = p['confirmed-round'] || 0;
      if (cr > 0) {
        return {
          pending: false,
          round: cr,
          confirmedBy: 'algod',
          providerInfo: { kind: 'algod-pending' },
        };
      }
      lastRound += 1;
      await algod.statusAfterBlock(lastRound).do();
    }
  } catch (e) {
    console.warn(`[Confirm] Algod sticky falló o timeout (${waitSeconds}s), intentando Indexer failover...`);
  }

  // 2) INDEXER Failover (usa algorand-failover.mjs)
  try {
    // lookupTransactionByID ya maneja failover entre múltiples nodos/indexers
    const r = await lookupTransactionByID(txId);
    const tx = r?.transaction || null;
    const cr = tx?.['confirmed-round'] || 0;

    if (cr > 0) {
      return {
        pending: false,
        round: cr,
        confirmedBy: 'indexer-failover',
        providerInfo: { kind: 'indexer-failover' },
      };
    }
  } catch (e) {
    console.warn('[Confirm] Indexer failover también falló o no encontró la tx:', e.message);
  }

  // No confirmado aún
  return {
    pending: true,
    round: null,
    confirmedBy: null,
    providerInfo: null,
  };
}

// ---------- Básicas ----------
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'certificates-api',
    env: process.env.NODE_ENV || 'dev',
    port: Number(PORT),
    time: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime_s: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

function parseAlgocertNote(noteUtf8, fallbackWallet = null) {
  if (!noteUtf8 || !noteUtf8.startsWith('ALGOCERT|')) return null;
  const p = noteUtf8.split('|');
  const version = p[1];
  const out = {
    version,
    hash: (p[2] || '').toLowerCase(),
    cid: null,
    tipo: null,
    nombre: null, // dueño
    wallet: fallbackWallet || null,
    ts: null,
  };

  if (version === 'v1') { // ALGOCERT|v1|hash|cid|wallet|ts
    out.cid = p[3] || null;
    out.wallet = p[4] || fallbackWallet || null;
    out.ts = p[5] ? Number(p[5]) : null;
  } else if (version === 'v2') { // ALGOCERT|v2|hash|cid|tipo|ownerName|wallet|ts
    out.cid = p[3] || null;
    out.tipo = p[4] || null;
    out.nombre = p[5] || null;
    out.wallet = p[6] || fallbackWallet || null;
    out.ts = p[7] ? Number(p[7]) : null; // <-- FIX aquí
  }
  return out;
}

// --- Fecha local EC ---
function toEcuadorLocal(ms) {
  if (ms == null || !Number.isFinite(ms)) return null;
  try {
    return new Intl.DateTimeFormat('es-EC', {
      timeZone: 'America/Guayaquil',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

// ============================================================
// GET /api/ipfs/get-index-info
// Obtiene información completa del índice /cert-index con failover
// ============================================================
app.get('/api/ipfs/get-index-info', async (_req, res) => {
  try {
    console.log('[GetIndexInfo] Iniciando consulta con failover IPFS...');

    let result = null;

    // Intentar con cada nodo IPFS hasta que uno responda
    for (let i = 0; i < IPFS_ENDPOINTS.length; i++) {
      const endpoint = IPFS_ENDPOINTS[i];

      try {
        console.log(`[GetIndexInfo] Probando nodo ${i + 1}/${IPFS_ENDPOINTS.length}: ${endpoint}`);

        const client = createClient(endpoint);

        // Timeout de 5 segundos por nodo
        const stat = await Promise.race([
          client.files.stat('/cert-index', { hash: true }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout 5s')), 5000)
          )
        ]);

        const cid = (stat.cid || stat.hash || '').toString();

        if (!cid) {
          throw new Error('CID vacío');
        }

        // Contar documentos en by-hash
        let docCount = 0;
        try {
          for await (const shardDir of client.files.ls('/cert-index/by-hash')) {
            const shardPath = `/cert-index/by-hash/${shardDir.name}`;

            for await (const doc of client.files.ls(shardPath)) {
              if (doc.name.endsWith('.json')) {
                docCount++;
              }
            }
          }
        } catch (countErr) {
          console.warn('[GetIndexInfo] No se pudo contar documentos:', countErr.message);
          docCount = 0; // No crítico
        }

        // Calcular gateway (convertir puerto 9095 → 8080)
        const gateway = endpoint
          .replace(/\/api\/v0$/, '')
          .replace(/:9095$/, ':8080')
          .replace(/:5001$/, ':8080');

        result = {
          ok: true,
          cid,
          gateway,
          endpoint,
          docCount,
          size: stat.cumulativeSize || stat.size || 0,
          sizeHuman: `${((stat.cumulativeSize || stat.size || 0) / 1024 / 1024).toFixed(2)} MB`,
          timestamp: new Date().toISOString(),
        };

        console.log(`[GetIndexInfo] ✅ Éxito en nodo ${i + 1}: CID=${cid}, Docs=${docCount}`);
        break; // Éxito, salir del loop

      } catch (nodeError) {
        const errorMsg = nodeError?.message || String(nodeError);
        console.warn(`[GetIndexInfo] ❌ Nodo ${i + 1} falló:`, errorMsg);

        // Si es el último nodo, lanzar error
        if (i === IPFS_ENDPOINTS.length - 1) {
          throw new Error(`Todos los nodos IPFS fallaron. Último error: ${errorMsg}`);
        }

        // Continuar con el siguiente nodo
        continue;
      }
    }

    // Si ningún nodo respondió (no debería llegar aquí)
    if (!result) {
      throw new Error('No se pudo obtener información de ningún nodo IPFS');
    }

    return res.json(result);

  } catch (e) {
    console.error('[GetIndexInfo] Error final:', e);
    return res.status(500).json({
      ok: false,
      error: e?.message || String(e),
      endpoints: IPFS_ENDPOINTS,
      timestamp: new Date().toISOString(),
    });
  }
});

// ---------- DB: certificados ----------
app.get('/api/certificados', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM certificados ORDER BY fecha DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error al obtener certificados:', err);
    res.status(500).json({ error: 'Error al obtener certificados' });
  }
});

app.delete('/api/eliminar-certificado/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM certificados WHERE id = $1', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Certificado no encontrado' });
    }
    res.json({ message: 'Certificado eliminado correctamente' });
  } catch (err) {
    console.error('❌ Error al eliminar certificado:', err);
    res.status(500).json({ error: 'Error al eliminar el certificado' });
  }
});

// ---------- DB: roles ----------
app.post('/api/guardar-rol', async (req, res) => {
  const { wallet, role, email } = req.body;  // ✅ INCLUIR EMAIL
  
  console.log('[guardar-rol] 📝 Request recibido:', { wallet, role, email });
  
  if (!wallet || !role) {
    console.error('[guardar-rol] ❌ Datos incompletos');
    return res.status(400).json({ error: 'Faltan datos: wallet y role son obligatorios' });
  }
  
  // Validar email si se proporciona
  if (email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@tesiscerttitlespo\.onmicrosoft\.com$/;
    if (!emailRegex.test(email)) {
      console.error('[guardar-rol] ❌ Email inválido:', email);
      return res.status(400).json({ 
        error: 'Email debe ser del dominio @tesiscerttitlespo.onmicrosoft.com' 
      });
    }
  }

  try {
    console.log('[guardar-rol] 💾 Guardando en BD...');
    
    // ✅ QUERY CORRECTA con email
    await pool.query(
      `INSERT INTO wallet_roles (wallet, role, email) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (wallet) DO UPDATE SET 
         role = EXCLUDED.role,
         email = COALESCE(EXCLUDED.email, wallet_roles.email)`,
      [wallet, role, email || null]
    );
    
    console.log('[guardar-rol] ✅ Rol guardado correctamente');
    
    res.json({ 
      success: true,
      message: 'Rol guardado correctamente' 
    });
    
  } catch (err) {
    console.error('[guardar-rol] ❌ Error en BD:', err);
    
    // Manejar errores específicos de PostgreSQL
    if (err.code === '23505') {
      // Unique violation
      if (err.constraint === 'wallet_roles_email_unique') {
        console.error('[guardar-rol] ❌ Email duplicado');
        return res.status(409).json({ 
          error: 'Este email ya está registrado con otra wallet' 
        });
      }
    }
    
    if (err.code === '23514') {
      // Check violation
      if (err.constraint === 'email_institutional_domain') {
        console.error('[guardar-rol] ❌ Email de dominio incorrecto');
        return res.status(400).json({ 
          error: 'Email debe ser del dominio @tesiscerttitlespo.onmicrosoft.com' 
        });
      }
    }
    
    // Error genérico
    console.error('[guardar-rol] ❌ Error inesperado:', err.message);
    res.status(500).json({ 
      error: 'Error al guardar el rol',
      details: err.message  // Solo en desarrollo
    });
  }
});

app.delete('/api/eliminar-rol/:wallet', async (req, res) => {
  const { wallet } = req.params;
  try {
    const result = await pool.query('DELETE FROM wallet_roles WHERE wallet = $1', [wallet]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Wallet no encontrada' });
    }
    res.json({ message: 'Rol eliminado correctamente' });
  } catch (err) {
    console.error('❌ Error en /eliminar-rol:', err);
    res.status(500).json({ error: 'Error al eliminar el rol' });
  }
});

app.get('/api/roles/:wallet', async (req, res) => {
  const { wallet } = req.params;
  try {
    const result = await pool.query(
      'SELECT wallet, role, email FROM wallet_roles WHERE wallet = $1',
      [wallet]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No se encontró un rol para esta wallet' });
    }
    
    res.json(result.rows[0]); // { wallet, role, email }
  } catch (err) {
    console.error('❌ Error en /roles/:wallet:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});


// Obtener rol por wallet O email
app.get('/api/obtener-rol', async (req, res) => {
  const { identificador } = req.query;
  
  if (!identificador) {
    return res.status(400).json({ error: 'Identificador requerido' });
  }

  try {
    // Buscar por wallet o email
    const result = await pool.query(
      `SELECT wallet, role, email 
       FROM wallet_roles 
       WHERE wallet = $1 OR email = $1
       LIMIT 1`,
      [identificador]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({
      wallet: result.rows[0].wallet,
      role: result.rows[0].role,
      email: result.rows[0].email
    });
  } catch (err) {
    console.error('❌ Error obteniendo rol:', err);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.get('/api/listar-roles', async (_req, res) => {
  try {
    const result = await pool.query('SELECT wallet, role, email FROM wallet_roles');
    
    // ✅ Convertir array a objeto con wallet como clave
    const rolesMap = {};
    result.rows.forEach(row => {
      rolesMap[row.wallet] = {
        role: row.role,
        email: row.email || ''
      };
    });
    
    res.json(rolesMap);
  } catch (err) {
    console.error('❌ Error al listar roles:', err);
    res.status(500).json({ error: 'Error al listar roles' });
  }
});

// ---------- ALGOD: health/params helpers ----------
app.get('/api/algod/health', async (_req, res) => {
  try {
    await algodHealthCheck();
    res.json({ ok: true });
  } catch (e) {
    res.status(503).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/api/algod/status', async (_req, res) => {
  try {
    const st = await algodGetStatus();
    res.json({
      lastRound: st['lastRound'],
      timeSinceLastRound: st['timeSinceLastRound'],
      catchupTime: st['catchupTime'] ?? null,
      lastCatchpoint: st['catchpoint'] ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

app.get('/api/algod/params', async (_req, res) => {
  try {
    const p = await algodGetParams();
    const safe = JSON.parse(JSON.stringify(p, (k, v) => (typeof v === 'bigint' ? Number(v) : v)));
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/debug/algod-status', async (_req, res) => {
  try {
    const st = await algodGetStatus();
    res.json({
      ok: true,
      lastRound: st['last-round'] ?? st['lastRound'],
      timeSinceLastRound: st['time-since-last-round'] ?? st['timeSinceLastRound'] ?? null,
      catchupTime: st['catchup-time'] ?? st['catchupTime'] ?? null,
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: e?.message || String(e) });
  }
});

app.get('/api/debug/params', async (_req, res) => {
  try {
    const p = await algodGetParams();
    res.json({
      ok: true,
      firstRound: p.firstRound,
      lastRound: p.lastRound,
      genesisID: p.genesisID,
      minFee: Number(p.minFee || p.fee || 0),
    });
  } catch (e) {
    res.status(503).json({ ok: false, error: e?.message || String(e) });
  }
});


// ---------- ALGOD: send/tx lookups ----------
app.post('/api/algod/sendRaw', async (req, res) => {
  try {
    const { raw } = req.body; // raw base64
    if (!raw) return res.status(400).json({ error: 'Falta campo raw (base64)' });
    const bytes = Buffer.from(raw, 'base64');
    const result = await sendRawTransaction(bytes);
    res.json(result); // { txId: '...' }
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e), text: e?.response?.text });
  }
});

app.get('/api/algod/tx/:txId', async (req, res) => {
  try {
    const { txId } = req.params;
    const info = await algodGetPendingTx(txId);
    const safe = toJSONSafe(info);
    res.json(safe);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});

async function buildSuggestedParams(algod) {
  const p = await algod.getTransactionParams().do();
  // Normalizamos y CAP de 1000 rondas
  const first = Number(p.firstRound ?? p['first-round']);
  const last = first + 1000; // <= CAP recomendado

  return {
    fee: Number(p.minFee ?? p.fee ?? 1000),
    flatFee: true,
    firstRound: first,
    lastRound: last,
    genesisHash: p.genesisHash ?? p['genesis-hash'],
    genesisID: p.genesisID ?? p['genesis-id'],
  };
}


// ---------- Indexer quick health ----------
app.get('/api/indexer/health', async (_req, res) => {
  try {
    // Usa el health check con failover
    const h = await indexerHealthCheck();
    res.json(h);
  } catch (e) {
    res.status(503).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---------- Subida PDF (IPFS + BD opcional) ----------
// Configurar multer para pasamanos en RAM (sin disco)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// --- Helper: lookup en índice IPFS por hash (opción B, sin BD)
async function lookupIndexByHash(hashHex) {
  try {
    const shard = shardPrefix(hashHex);
    const rootCid = await getRootCid(); // raíz publicada del índice
    const path = `/by-hash/${shard}/${hashHex}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${path}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const meta = JSON.parse(buf.toString('utf8')); // { version, hash, pdf_cid, txid, ... }

    return meta; // si existe
  } catch {
    return null; // no está en el índice
  }
}


// ---------- Subida PDF (IPFS, sin BD; dedup vía índice IPFS) ----------
app.post('/api/subir-certificado', upload.single('file'), async (req, res) => {
  const file = req.file;
  // wallet es opcional ahora (compat: si viene, lo ignoramos aquí)
  if (!file) {
    return res.status(400).json({ error: 'Archivo PDF requerido' });
  }

  try {
    // 1) Hash canónico en RAM
    const buffer = file.buffer;
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();

    // 2) Chequear SI YA EXISTE en el índice IPFS (Opción B)
    const existing = await lookupIndexByHash(hash);
    if (existing) {
      // No hay archivo en disco que borrar
      return res.status(409).json({
        error: 'Ya existe un certificado con este hash en el índice',
        hash,
        meta: existing,         // meta.hash, meta.pdf_cid, meta.txid, title, owner, timestamp, ...
      });
    }

    // 3) No está en índice -> subir a IPFS
    const added = await ipfs.add(buffer, { pin: true }); // pin opcional
    const cid = added.cid.toString();

    // Sin fs.unlinkSync

    // NOTA: aquí NO publicamos al índice todavía (eso lo haces cuando anclas y llamas a /api/index/publish-hash)
    // Si quieres, podrías devolver 'preview' con datos mínimos, pero sin txid no hay entrada formal en el índice.

    return res.json({ ok: true, cid, hash });
  } catch (err) {
    console.error('❌ Error en /subir-certificado (IPFS-only):', err);
    // Sin cleanup de disco
    return res.status(500).json({ error: 'Error al subir el certificado a IPFS' });
  }
});


// Lee en el índice publicado si ya existe metadata para un hash dado.
// Devuelve el JSON si existe; null si no hay índice o no está el hash.
// Lee en el índice publicado si ya existe metadata para un hash dado.
// Devuelve el JSON si existe; null si no hay índice o no está el hash.
async function readIndexMetaByHash(hashHex) {
  try {
    const shard = shardPrefix(hashHex);
    const rootCid = await getRootCid();            // CID del índice publicado
    if (!rootCid) return null;                     // aún no hay índice publicado
    const path = `${rootCid}/by-hash/${shard}/${hashHex}.json`;

    const chunks = [];
    // FIX: Usar catWithFailover para robustez y mejor manejo de errores (e.g. "no link named")
    for await (const c of catWithFailover(path)) chunks.push(c);

    const buf = Buffer.concat(chunks);
    return JSON.parse(buf.toString('utf8'));
  } catch (e) {
    // Si es error "no link named" o "not found", significa que no existe -> null
    const msg = e?.message || '';
    if (msg.includes('no link named') || msg.includes('not found') || msg.includes('does not exist')) {
      return null;
    }
    // Otros errores (timeout, network) -> logear warning pero retornar null para no romper el flujo
    console.warn('[readIndexMetaByHash] Warning: no se pudo leer metadato (asumiendo inexistente):', msg);
    return null;
  }
}

// ---------- Guardar Título (v1) SOLO IPFS, SIN BD ----------
// Paso 1 del flujo v1: subir PDF a IPFS y devolver hash+cid.
// No publica el índice aquí (eso se hace en /api/index/publish-hash cuando ya tengas txid).
app.post('/api/guardar-titulo', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    // opcional del front: wallet del destinatario del anclaje v1 (no se guarda aquí)
    const wallet = String(req.body.wallet || '').trim();

    if (!file) return res.status(400).json({ error: 'Falta archivo PDF (file)' });

    // 1) RAMash canónico en el servidor (desde RAM)
    const buffer = file.buffer;
    const serverHashHex = crypto.createHash('sha256').update(buffer).digest('hex').toLowerCase();

    // No requerimos unlinkSync porque no hay archivo en disco

    // 2) (Opcional) Verificar duplicado en el ÍNDICE publicado
    //    Si ya está publicado por-hash, cortamos con 409 para que el front no repita el proceso.
    const existingMeta = await readIndexMetaByHash(serverHashHex);
    if (existingMeta) {
      return res.status(409).json({
        ok: false,
        error: 'Hash ya está indexado en IPFS',
        hash: serverHashHex,
        meta: existingMeta,   // { version, hash, pdf_cid, txid, wallet, timestamp, title?, owner? }
      });
    }

    // 3) Subir PDF a IPFS (contenido-addressable)
    const added = await ipfs.add(buffer);
    const cid = added.cid.toString();

    // 4) Responder (sin escribir en BD)
    //    Importante: el índice se publica más adelante (paso 3 del front) con /api/index/publish-hash,
    //    cuando ya tengas el txid del anclaje v1 (/api/algod/anchorNote).
    return res.json({
      ok: true,
      message: 'Título guardado en IPFS',
      cid,
      hash: serverHashHex,
      // opcionalmente devolvemos wallet que vino del front, por conveniencia de UI
      wallet: wallet || null,
    });
  } catch (err) {
    console.error('❌ Error en /guardar-titulo:', err);
    return res.status(500).json({ error: 'Error interno al guardar título' });
  }
});


app.post('/api/guardar-titulo-BD', upload.single('file'), async (req, res) => {
  try {
    const { wallet } = req.body;
    const file = req.file;
    if (!file || !wallet) return res.status(400).json({ error: 'Faltan datos (file, wallet)' });

    const buffer = file.buffer;
    const serverHashHex = crypto.createHash('sha256').update(buffer).digest('hex');

    const dup = await pool.query('SELECT 1 FROM certificados WHERE hash = $1', [serverHashHex]);
    if (dup.rowCount > 0) {
      // No hay archivo que borrar
      return res.status(409).json({ error: 'Hash ya registrado', hash: serverHashHex });
    }

    const added = await ipfs.add(buffer);
    const cid = added.cid.toString();

    await pool.query(
      'INSERT INTO certificados (wallet, nombre_archivo, hash, cid) VALUES ($1, $2, $3, $4)',
      [wallet, file.originalname, serverHashHex, cid]
    );

    // fs.unlinkSync(file.path); // Ya no es necesario
    return res.json({ message: 'Título guardado', cid, hash: serverHashHex });
  } catch (err) {
    console.error('Error al guardar título:', err);
    return res.status(500).json({ error: 'Error interno al guardar título' });
  }
});

// ---------- Anclajes (robusto) ----------
async function waitForConfirmation(algod, txId, timeout = 20) {
  const start = Date.now();
  let lastRound = (await algod.status().do())['last-round'];

  while ((Date.now() - start) / 1000 < timeout) {
    const p = await algod.pendingTransactionInformation(txId).do();
    if (p['pool-error'] && p['pool-error'].length > 0) {
      return { ...p, __rejected: true };
    }
    if (p['confirmed-round'] && p['confirmed-round'] > 0) {
      return p;
    }
    lastRound += 1;
    await algod.statusAfterBlock(lastRound).do();
  }
  return { __timeout: true };
}

// NOTE: ALGOCERT|v1|<hash>|<cid>|<wallet>|<ts>
app.post('/api/algod/anchorNote', express.json(), async (req, res) => {
  try {
    console.log('[anchorNote] payload', req.body);
    if (!serverAcct) return res.status(501).json({ error: 'Server signer no configurado' });

    let { to, hashHex, cid, filename } = req.body || {};
    to = String(to || '').trim();
    hashHex = String(hashHex || '').trim().toLowerCase();
    cid = String(cid || '').trim();
    filename = (String(filename || '').trim()).slice(0, 128);

    if (!algosdk.isValidAddress(to)) return res.status(400).json({ error: `to inválido: ${to}` });
    if (!/^[0-9a-f]{64}$/.test(hashHex)) return res.status(400).json({ error: 'hashHex inválido (64 hex chars)' });
    if (!cid) return res.status(400).json({ error: 'cid requerido' });

    const ts = Date.now();
    const noteStr = `ALGOCERT|v1|${hashHex}|${cid}|${to}|${ts}`;
    const note = new Uint8Array(Buffer.from(noteStr, 'utf8'));

    // params frescos + flat fee segura (usa failover)
    const sp = await buildSuggestedParamsFailover();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: serverAcct.addr,
      to,
      amount: 0,
      note,
      suggestedParams: sp,
    });

    const stxn = txn.signTxn(serverAcct.sk);

    let txId;
    try {
      // Usar sendRawTransaction con failover
      const rLocal = await sendRawTransaction(stxn);
      txId = rLocal.txId;
    } catch (e) {
      const poolError = e?.response?.body?.message || e?.message || String(e);
      return res.status(400).json({
        ok: false,
        error: 'Transacción rechazada por el mempool',
        poolError,
      });
    }

    // Confirmación: prefer ALGOD + fallback Indexer
    const conf = await confirmRoundWithFallback({
      algod: algodClient,
      // indexerClient ya no se pasa
      // INDEXER_URL tampoco
      txId,
      waitSeconds: 20,
    });

    if (conf.pending) {
      return res.status(202).json({
        ok: true,
        txId,
        round: null,
        pending: true,
        confirmedBy: null,
        providerInfo: null,
        notePreview: noteStr.slice(0, 200),
        processTs: ts,
        processAtLocal: toEcuadorLocal(ts),
        message: 'Enviada pero aún sin confirmación (consulta luego).',
      });
    }

    return res.json({
      ok: true,
      txId,
      round: conf.round,
      pending: false,
      confirmedBy: conf.confirmedBy,   // 'algod' | 'indexer-sdk' | 'indexer-rest'
      providerInfo: conf.providerInfo,
      notePreview: noteStr.slice(0, 200),
      processTs: ts,
      processAtLocal: toEcuadorLocal(ts),
    });
  } catch (e) {
    console.error('anchorNote error:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

// NOTE: ALGOCERT|v2|<hash>|<cid>|<tipo>|<owner>|<wallet>|<ts>
app.post('/api/algod/anchorNoteUpload', express.json(), async (req, res) => {
  try {
    console.log('[anchorNoteUpload] payload', req.body);
    if (!serverAcct) return res.status(501).json({ error: 'Server signer no configurado' });

    let { to, hashHex, cid, tipo, nombreCert, filename } = req.body || {};
    to = String(to || '').trim();
    hashHex = String(hashHex || '').trim().toLowerCase();
    cid = String(cid || '').trim();
    tipo = String(tipo || '').trim();
    nombreCert = String(nombreCert || '').trim();
    filename = (String(filename || '').trim()).slice(0, 128);

    if (!algosdk.isValidAddress(to)) return res.status(400).json({ error: `to inválido: ${to}` });
    if (!/^[0-9a-f]{64}$/.test(hashHex)) return res.status(400).json({ error: 'hashHex inválido (64 hex chars)' });
    if (!tipo) return res.status(400).json({ error: 'tipo requerido' });
    if (!nombreCert) return res.status(400).json({ error: 'nombreCert requerido' });
    if (!cid) return res.status(400).json({ error: 'cid requerido' });

    const clean = (s, max = 160) => s.replace(/\|/g, ' ').slice(0, max);
    const ts = Date.now();

    const noteStr = `ALGOCERT|v2|${hashHex}|${cid}|${clean(tipo, 64)}|${clean(nombreCert, 160)}|${to}|${ts}`;
    const note = new Uint8Array(Buffer.from(noteStr, 'utf8'));

    // params frescos + flat fee segura (usa failover)
    const sp = await buildSuggestedParamsFailover();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: serverAcct.addr,
      to,
      amount: 0,
      note,
      suggestedParams: sp,
    });

    const stxn = txn.signTxn(serverAcct.sk);

    let txId;
    try {
      // Usar sendRawTransaction con failover
      const rLocal = await sendRawTransaction(stxn);
      txId = rLocal.txId;
    } catch (e) {
      const poolError = e?.response?.body?.message || e?.message || String(e);
      return res.status(400).json({
        ok: false,
        error: 'Transacción rechazada por el mempool',
        poolError,
      });
    }

    // Confirmación: prefer ALGOD + fallback Indexer
    const conf = await confirmRoundWithFallback({
      algod: algodClient,
      // indexerClient ya no se pasa
      // INDEXER_URL tampoco
      txId,
      waitSeconds: 20,
    });

    if (conf.pending) {
      return res.status(202).json({
        ok: true,
        txId,
        round: null,
        pending: true,
        confirmedBy: null,
        providerInfo: null,
        notePreview: noteStr.slice(0, 200),
        processTs: ts,
        processAtLocal: toEcuadorLocal(ts),
        message: 'Enviada pero aún sin confirmación (consulta luego).'
      });
    }

    return res.json({
      ok: true,
      txId,
      round: conf.round,
      pending: false,
      confirmedBy: conf.confirmedBy,
      providerInfo: conf.providerInfo,
      notePreview: noteStr.slice(0, 200),
      processTs: ts,
      processAtLocal: toEcuadorLocal(ts),
    });
  } catch (e) {
    console.error('anchorNoteUpload error:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});



app.get('/api/debug/tx/:txId', async (req, res) => {
  try {
    const info = await algodGetPendingTx(req.params.txId);
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});


// ---------- Adjuntar tx a BD (opcional) ----------
app.post('/api/certificados/:hash/attach-tx', express.json(), async (req, res) => {
  try {
    const { hash } = req.params;
    const { txId, round } = req.body || {};
    if (!hash || !txId) return res.status(400).json({ error: 'Faltan hash o txId' });

    const q = `
      UPDATE certificados
         SET txid = $1, round = COALESCE($2, round)
       WHERE hash = $3
       RETURNING id, wallet, nombre_archivo, hash, cid, txid, round, fecha;
    `;
    const r = await pool.query(q, [txId, round ?? null, hash]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Hash no encontrado' });

    res.json({ ok: true, row: r.rows[0] });
  } catch (e) {
    console.error('attach-tx error:', e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- Descargas desde IPFS ----------
app.get('/api/certificados/:hash/download', async (req, res) => {
  try {
    const { hash } = req.params;
    const r = await pool.query(
      `SELECT nombre_archivo, cid
         FROM certificados
        WHERE hash = $1
        LIMIT 1`,
      [hash]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No existe ese hash' });

    const { nombre_archivo, cid } = r.rows[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(nombre_archivo || `documento-${hash.slice(0, 8)}`).replace(/"/g, '')}.pdf"`
    );

    for await (const chunk of ipfs.cat(cid)) {
      res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error('download error:', e);
    res.status(502).json({ error: 'No se pudo descargar desde IPFS' });
  }
});

app.get('/api/certificadosRedirect/:hash/download', async (req, res) => {
  try {
    const { hash } = req.params;
    const head = String(req.query.head || '').trim() === '1';

    const r = await pool.query(
      `SELECT cid, nombre_archivo FROM certificados WHERE hash = $1 LIMIT 1`,
      [hash]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'No existe el hash' });

    const { cid } = r.rows[0];
    if (!cid) return res.status(404).json({ error: 'El certificado no tiene CID' });

    if (head) {
      return res.json({ ok: true, cid });
    }

    return res.redirect(`${IPFS_GATEWAY_URL}/ipfs/${cid}`);
  } catch (e) {
    console.error('download redirect error:', e);
    res.status(500).json({ error: e?.message || String(e) });
  }
});

// ---------- Indexer por txId (parse NOTE) ----------
app.get('/api/indexer/tx/:txId', async (req, res) => {
  const { txId } = req.params;
  try {
    // 1) SDK
    try {
      const r = await indexerClient.lookupTransactionByID(txId).do();
      const tx = r?.transaction || null;
      if (tx) {
        const noteB64 = tx.note || null;
        const noteUtf8 = noteB64 ? Buffer.from(noteB64, 'base64').toString('utf8') : null;
        const parsed = parseAlgocertNote(noteUtf8, tx.sender ?? null);
        const processTs = parsed?.ts ?? null;

        return res.json({
          ok: true,
          txId,
          round: tx['confirmed-round'] ?? null,
          from: tx.sender ?? null,
          to: tx['payment-transaction']?.receiver ?? null,
          noteB64,
          noteUtf8,
          parsed,
          dates: {
            processTs,
            processAtLocal: processTs ? toEcuadorLocal(processTs) : null,
          },
          provider: 'indexer',
        });
      }
    } catch (e) {
      // 2) REST directo
      try {
        const url = `${INDEXER_URL.replace(/\/+$/, '')}/v2/transactions/${txId}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`Indexer REST ${r.status}`);
        const j = await r.json();
        const tx = j?.transaction || null;
        if (tx) {
          const noteB64 = tx.note || null;
          const noteUtf8 = noteB64 ? Buffer.from(noteB64, 'base64').toString('utf8') : null;
          const parsed = parseAlgocertNote(noteUtf8, tx.sender ?? null);
          const processTs = parsed?.ts ?? null;

          return res.json({
            ok: true,
            txId,
            round: tx['confirmed-round'] ?? null,
            from: tx.sender ?? null,
            to: tx['payment-transaction']?.receiver ?? null,
            noteB64,
            noteUtf8,
            parsed,
            dates: {
              processTs,
              processAtLocal: processTs ? toEcuadorLocal(processTs) : null,
            },
            provider: 'indexer-rest',
          });
        }
      } catch (e2) {
        // 3) pendiente (muy reciente)
        try {
          const info = await algodClient.pendingTransactionInformation(txId).do();
          const noteB64 = info?.txn?.txn?.note || null;
          const noteUtf8 = noteB64 ? Buffer.from(noteB64, 'base64').toString('utf8') : null;
          const parsed = parseAlgocertNote(noteUtf8, info?.sender ?? null);
          const processTs = parsed?.ts ?? null;

          return res.json({
            ok: true,
            txId,
            round: info['confirmed-round'] ?? null,
            from: info?.sender ?? null,
            to: info?.['payment-transaction']?.receiver ?? null,
            noteB64,
            noteUtf8,
            parsed,
            dates: {
              processTs,
              processAtLocal: processTs ? toEcuadorLocal(processTs) : null,
            },
            provider: 'algod-pending',
          });
        } catch {
          throw e2;
        }
      }
    }
    return res.status(404).json({ ok: false, error: 'Transacción no encontrada' });
  } catch (e) {
    console.error('lookup tx by id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// ---------- Validación sin BD (ÍNDICE IPFS → INDEXER; fallback: lookup-by-hash) ----------
app.get('/api/validate/hash/:hash', async (req, res) => {
  try {
    const hash = (req.params.hash || '').toLowerCase().trim();
    if (!/^[0-9a-f]{64}$/.test(hash)) {
      return res.status(400).json({ error: 'hash inválido (64 hex chars)' });
    }

    // Helper para unificar respuesta final
    const finish = (ok, matches, message, indexer, extra = {}) => {
      return res.json({
        ok,
        matches: !!matches,
        message,
        indexer,         // shape: el mismo que devuelve /api/indexer/tx/:txId o lookup-by-hash
        ...extra         // p.ej. { meta, source: 'ipfs-index'|'indexer-lookup' }
      });
    };

    // 1) Intento A: resolver meta desde ÍNDICE IPFS (by-hash)
    try {
      const rootCid = await getRootCid();            // de ./indexing.mjs
      const shard = shardPrefix(hash);              // de ./indexing.mjs
      const metaPath = `/by-hash/${shard}/${hash}.json`;

      const chunks = [];
      for await (const c of ipfs.cat(`${rootCid}${metaPath}`)) chunks.push(c);
      const buf = Buffer.concat(chunks);
      const meta = JSON.parse(buf.toString('utf8')); // { version, hash, pdf_cid, txid, wallet?, timestamp, title?, owner? }

      const txId = meta?.txid || null;

      if (txId) {
        // 1a) Con txId, pedimos al indexer tu endpoint ya existente para parsear NOTE
        const base = `http://localhost:${PORT}`;
        const r = await fetch(`${base}/api/indexer/tx/${txId}`);
        if (!r.ok) {
          // Si falla momentáneamente el indexer, igual devolvemos meta
          return finish(false, false, 'No se pudo verificar en indexer (pero hay metadatos en IPFS).', null, {
            meta,
            source: 'ipfs-index'
          });
        }
        const j = await r.json();
        const parsedHash = (j?.parsed?.hash || '').toLowerCase();
        const matches = parsedHash === hash;

        return finish(true, matches,
          matches
            ? 'El hash coincide con la nota on-chain (IPFS→Indexer).'
            : 'La nota on-chain no coincide con el hash (IPFS→Indexer).',
          j,
          { meta, source: 'ipfs-index' }
        );
      }

      // 1b) Si hay meta pero no trae txId, informamos “pendiente”
      return finish(false, false, 'Metadatos encontrados en IPFS pero sin txId asociado.', null, {
        meta,
        source: 'ipfs-index'
      });
    } catch (ipfsErr) {
      // No hay índice o no se encontró el hash -> seguimos a fallback
      // console.warn('[validate/hash] índice IPFS no hallado / error:', ipfsErr?.message || ipfsErr);
    }

    // 2) Intento B (fallback): Lookup en INDEXER por note-prefix con tu endpoint /api/indexer/lookup-by-hash
    try {
      const base = `http://localhost:${PORT}`;
      // Puedes parametrizar afterHours/aheadHours vía query si quieres
      const r = await fetch(`${base}/api/indexer/lookup-by-hash?hashHex=${hash}`);
      if (!r.ok) {
        return finish(false, false, 'No se pudo consultar el indexer (fallback).', null, {
          source: 'indexer-lookup'
        });
      }
      const j = await r.json(); // shape: {found, txId, round, noteUtf8, parsed, dates, provider, ...}

      if (j?.found) {
        const parsedHash = (j?.parsed?.hash || '').toLowerCase();
        const matches = parsedHash === hash;

        return finish(true, matches,
          matches
            ? 'El hash coincide con la nota on-chain (indexer lookup).'
            : 'La nota on-chain no coincide con el hash (indexer lookup).',
          j,
          { source: 'indexer-lookup' }
        );
      }

      // No encontrado en indexer
      return finish(false, false, 'No hay coincidencias para este hash en el indexer.', j || { found: false }, {
        source: 'indexer-lookup'
      });
    } catch (idxErr) {
      // Error duro al consultar indexer
      // console.error('[validate/hash] indexer lookup error:', idxErr);
      return res.status(502).json({ ok: false, error: 'Fallo consultando el indexer', detail: idxErr?.message || String(idxErr) });
    }
  } catch (e) {
    console.error('validate/hash error:', e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// GET /api/validate-lite/hash/:hash
// Solo comprueba que exista meta en el índice IPFS y que meta.hash === :hash
app.get('/api/validate-lite/hash/:hash', async (req, res) => {
  try {
    const hash = (req.params.hash || '').toLowerCase().trim();
    if (!/^[0-9a-f]{64}$/.test(hash)) return res.status(400).json({ error: 'hash inválido' });

    const rootCid = await getRootCid();
    const shard = shardPrefix(hash);
    const metaPath = `/by-hash/${shard}/${hash}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${metaPath}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const meta = JSON.parse(buf.toString('utf8'));

    const matches = (meta?.hash || '').toLowerCase() === hash;
    res.json({
      ok: true,
      matches,
      message: matches ? 'Meta hallada en IPFS y coincide el hash.' : 'Meta hallada en IPFS, pero no coincide el hash.',
      meta,
      source: 'ipfs-index-only'
    });
  } catch (e) {
    res.status(404).json({ ok: false, error: 'No encontrado en índice IPFS' });
  }
});



// ---------- Lookup por HASH (SDK→REST) (si quieres mantenerlo) ----------
app.get('/api/indexer/lookup-by-hash', async (req, res) => {
  try {
    const hashHex = String(req.query.hashHex || '').trim().toLowerCase();
    const wallet = String(req.query.wallet || '').trim();
    const role = String(req.query.role || '').trim();

    const afterHours = req.query.afterHours != null
      ? Math.max(1, Number(req.query.afterHours))
      : IDX_LOOKBACK_HOURS;

    const aheadHours = req.query.aheadHours != null
      ? Math.max(0, Number(req.query.aheadHours))
      : IDX_AHEAD_HOURS;

    if (!/^[0-9a-f]{64}$/.test(hashHex)) {
      return res.status(400).json({ error: 'hashHex inválido (64 hex chars)' });
    }

    const now = Date.now();
    const afterIso = new Date(now - afterHours * 3600e3).toISOString();
    const beforeIso = new Date(now + aheadHours * 3600e3).toISOString();

    const tryVersion = async (ver) => {
      const prefixUtf8 = `ALGOCERT|${ver}|${hashHex}|`;
      const notePrefixBytes = new Uint8Array(Buffer.from(prefixUtf8, 'utf8'));
      const prefixB64 = Buffer.from(prefixUtf8, 'utf8').toString('base64');

      // 1) SDK
      try {
        let q = indexerClient
          .searchForTransactions()
          .notePrefix(notePrefixBytes)
          .txType('pay')
          .afterTime(afterIso)
          .beforeTime(beforeIso)
          .limit(10);

        if (algosdk.isValidAddress(wallet)) {
          q = q.address(wallet);
          if (role === 'receiver' || role === 'sender') q = q.addressRole(role);
        }

        const resp = await q.do();
        const txs = resp.transactions || [];
        if (txs.length > 0) {
          txs.sort((a, b) => (b['confirmed-round'] || 0) - (a['confirmed-round'] || 0));
          const tx = txs[0];
          const noteB64 = tx.note || null;
          const noteUtf8 = noteB64 ? Buffer.from(noteB64, 'base64').toString('utf8') : null;
          const parsed = parseAlgocertNote(noteUtf8, tx.sender || null);
          if (parsed) {
            const processTs = parsed?.ts ?? null;
            return {
              found: true,
              txId: tx.id,
              round: tx['confirmed-round'] || null,
              from: tx.sender,
              to: tx['payment-transaction']?.receiver || null,
              noteUtf8,
              parsed,
              dates: {
                processTs,
                processAtLocal: processTs ? toEcuadorLocal(processTs) : null,
              },
              provider: 'sdk',
              afterIso,
              beforeIso,
              hours: { afterHours, aheadHours }
            };
          }
        }
      } catch (sdkErr) {
        console.warn('[Indexer SDK] fallo/timeout:', sdkErr?.message || sdkErr);
      }

      // 2) REST
      try {
        const url = new URL(`${INDEXER_URL.replace(/\/+$/, '')}/v2/transactions`);
        url.searchParams.set('note-prefix', prefixB64);
        url.searchParams.set('tx-type', 'pay');
        url.searchParams.set('after-time', afterIso);
        url.searchParams.set('before-time', beforeIso);
        url.searchParams.set('limit', '10');
        if (algosdk.isValidAddress(wallet)) {
          url.searchParams.set('address', wallet);
          if (role === 'receiver' || role === 'sender') url.searchParams.set('address-role', role);
        }

        const r = await fetch(url.toString());
        if (!r.ok) throw new Error(`REST indexer ${r.status}`);
        const j = await r.json();
        const txs = j?.transactions || [];
        if (txs.length > 0) {
          txs.sort((a, b) => (b['confirmed-round'] || 0) - (a['confirmed-round'] || 0));
          const tx = txs[0];
          const noteB64 = tx.note || null;
          const noteUtf8 = noteB64 ? Buffer.from(noteB64, 'base64').toString('utf8') : null;
          const parsed = parseAlgocertNote(noteUtf8, tx.sender || null);
          if (parsed) {
            const processTs = parsed?.ts ?? null;
            return {
              found: true,
              txId: tx.id,
              round: tx['confirmed-round'] || null,
              from: tx.sender,
              to: tx['payment-transaction']?.receiver || null,
              noteUtf8,
              parsed,
              dates: {
                processTs,
                processAtLocal: processTs ? toEcuadorLocal(processTs) : null,
              },
              provider: 'rest',
              afterIso,
              beforeIso,
              hours: { afterHours, aheadHours }
            };
          }
        }
      } catch (restErr) {
        console.warn('[Indexer REST] fallo/timeout:', restErr?.message || restErr);
      }

      return null;
    };

    const versions = ['v2', 'v1'];
    for (const ver of versions) {
      const r = await tryVersion(ver);
      if (r) return res.json(r);
    }

    return res.json({
      found: false,
      afterIso,
      beforeIso,
      hours: { afterHours, aheadHours },
      reason: 'no match or provider timeout'
    });
  } catch (e) {
    console.error('lookup-by-hash error:', e);
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

// POST /api/index/publish-hash
// Body:
// {
//   "hash": "...",         // sha256 del PDF (hex)
//   "pdf_cid": "...",      // CID del PDF en IPFS
//   "txid": "...",         // tx de Algorand
//   "timestamp": "...",    // ISO string
//   "title": "opcional",   // tipo de certificado (string)
//   "owner_name": "opcional", // nombre dueño (texto libre, se normaliza)
//   "wallet": "opcional"   // dirección ALGO (puede ser null)
// }
app.post('/api/index/publish-hash', async (req, res) => {
  try {
    const {
      hash, pdf_cid, txid, timestamp,
      title, owner_name, wallet
    } = req.body || {};

    if (!hash || !pdf_cid || !txid || !timestamp) {
      return res.status(400).json({ error: 'Faltan campos: hash, pdf_cid, txid, timestamp' });
    }

    // LOCK: Evitar que el script de sync sobrescriba mientras publicamos
    const LOCK_FILE = '/tmp/ipfs-writer.lock';
    try { fs.writeFileSync(LOCK_FILE, String(Date.now())); } catch (e) { console.warn('[LOCK] Error creando lock:', e.message); }

    const shard = shardPrefix(hash);
    const ownerNorm = normalizeOwnerName(owner_name || '');
    const ownerPrefix = ownerNorm ? keyPrefixFromOwner(ownerNorm) : null;

    // Metadato canónico por hash
    const meta = {
      version: 'ALGOCERT-v2',
      hash,
      pdf_cid,
      txid,
      wallet: wallet || null,
      timestamp,
      title: title || null,
      owner: ownerNorm || null
    };

    // Paths en MFS
    const stagingMetaPath = `/staging/by-hash/${shard}/${hash}.json`;
    const finalMetaPath = `/cert-index/by-hash/${shard}/${hash}.json`;

    await ensureMfsDirs([`/staging/by-hash/${shard}`, `/cert-index/by-hash/${shard}`]);
    await mfsWriteJson(stagingMetaPath, meta);

    // Índice por dueño (lista)
    let ownerListPath = null;
    if (ownerNorm) {
      const stagingOwnerDir = `/staging/by-owner/${ownerPrefix}`;
      const finalOwnerDir = `/cert-index/by-owner/${ownerPrefix}`;
      ownerListPath = `${finalOwnerDir}/${ownerNorm}.json`;
      const stagingOwnerListPath = `${stagingOwnerDir}/${ownerNorm}.json`;

      await ensureMfsDirs([stagingOwnerDir, finalOwnerDir]);

      const current = (await mfsReadJsonOrNull(ownerListPath)) || { owner: ownerNorm, items: [] };
      const exists = current.items.find(x => x.hash === hash);
      if (!exists) {
        current.items.push({
          hash,
          txid,
          pdf_cid,
          timestamp,
          title: title || null
        });
        // ordena desc por fecha
        current.items.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      }
      await mfsWriteJson(stagingOwnerListPath, current);
      await mfsMove(stagingOwnerListPath, ownerListPath);
    }

    // Commit de metadato por hash
    await mfsMove(stagingMetaPath, finalMetaPath);

    // Publicar raíz del índice
    const rootCid = await publishIndexRoot();

    // LOG detallado para debugging/QA
    console.log('[publish-hash] meta', meta);
    console.log('[publish-hash] paths', {
      stagingMetaPath,
      finalMetaPath,
      ownerListPath,
    });
    console.log('[publish-hash] rootCid', rootCid);

    // UNLOCK
    try { if (fs.existsSync('/tmp/ipfs-writer.lock')) fs.unlinkSync('/tmp/ipfs-writer.lock'); } catch { }

    return res.json({
      ok: true,
      rootCid,
      paths: {
        meta: `/ipfs/${rootCid}/by-hash/${shard}/${hash}.json`,
        owner: ownerListPath ? `/ipfs/${rootCid}/by-owner/${ownerPrefix}/${ownerNorm}.json` : null
      }
    });
  } catch (e) {
    // UNLOCK
    try { if (fs.existsSync('/tmp/ipfs-writer.lock')) fs.unlinkSync('/tmp/ipfs-writer.lock'); } catch { }

    console.error('publish-hash error:', e);
    return res.status(500).json({ error: 'No se pudo publicar en el índice', detail: e.message });
  }
});

// GET /api/index/lookup/:hash
app.get('/api/index/lookup/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const shard = shardPrefix(hash);
    const rootCid = await getRootCid();
    const path = `/by-hash/${shard}/${hash}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${path}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const json = JSON.parse(buf.toString('utf8'));

    return res.json({
      from: `/ipfs/${rootCid}${path}`,
      meta: json
    });
  } catch (e) {
    return res.status(404).json({ error: 'No encontrado en el índice', detail: e.message });
  }
});

// GET /api/index/search-owner?owner=<nombre>
app.get('/api/index/search-owner', async (req, res) => {
  try {
    const { owner } = req.query;
    const ownerNorm = normalizeOwnerName(owner || '');
    if (!ownerNorm) return res.status(400).json({ error: 'owner requerido' });

    const prefix = keyPrefixFromOwner(ownerNorm);
    const rootCid = await getRootCid();
    const path = `/by-owner/${prefix}/${ownerNorm}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${path}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const list = JSON.parse(buf.toString('utf8'));

    return res.json({
      from: `/ipfs/${rootCid}${path}`,
      ...list
    });
  } catch (e) {
    return res.status(404).json({ error: 'No hay índice para ese dueño', detail: e.message });
  }
});

// GET /api/index/search-hash?hash=<hex>
app.get('/api/index/search-hash', async (req, res) => {
  try {
    const { hash } = req.query;
    const h = String(hash || '').toLowerCase().trim();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      return res.status(400).json({ error: 'hash query param inválido (64 hex chars)' });
    }

    const rootCid = await getRootCid();
    const shard = shardPrefix(h);
    const path = `/by-hash/${shard}/${h}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${path}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const meta = JSON.parse(buf.toString('utf8'));

    return res.json({
      ok: true,
      meta,
      pdf_cid: meta.pdf_cid || meta.cid // compatibilidad
    });
  } catch (e) {
    return res.status(404).json({ error: 'No encontrado en el índice', detail: e.message });
  }
});

// GET /api/download/by-hash/:hash
// Lee /cert-index/by-hash/<shard>/<hash>.json para obtener el CID del PDF y lo hace streaming.
// No usa BD.
app.get('/api/download/by-hash/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const h = String(hash || '').toLowerCase().trim();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      return res.status(400).json({ error: 'hash inválido (64 hex chars)' });
    }

    // 1) Buscar meta en índice IPFS
    const rootCid = await getRootCid();
    const shard = shardPrefix(h);
    const metaPath = `/by-hash/${shard}/${h}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${metaPath}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const meta = JSON.parse(buf.toString('utf8'));

    const pdfCid = meta?.pdf_cid || meta?.cid || null;
    if (!pdfCid) {
      return res.status(404).json({ error: 'Meta encontrado, pero sin pdf_cid' });
    }

    // 2) Nombre archivo (no guardamos filename en meta; proponemos uno)
    const filename =
      `cert-${(meta?.owner || 'owner').toString().replace(/[^A-Z0-9]+/gi, '_')}-${h.slice(0, 8)}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // 3) Streaming desde IPFS
    for await (const chunk of ipfs.cat(pdfCid)) {
      res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error('download by-hash error:', e);
    return res.status(502).json({ error: 'No se pudo descargar desde IPFS (índice)' });
  }
});

// GET /api/download/redirect/by-hash/:hash
// Resuelve el CID desde el índice IPFS y redirige al gateway configurado.
app.get('/api/download/redirect/by-hash/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const h = String(hash || '').toLowerCase().trim();
    if (!/^[0-9a-f]{64}$/.test(h)) {
      return res.status(400).json({ error: 'hash inválido (64 hex chars)' });
    }

    const rootCid = await getRootCid();
    const shard = shardPrefix(h);
    const metaPath = `/by-hash/${shard}/${h}.json`;

    const chunks = [];
    for await (const c of ipfs.cat(`${rootCid}${metaPath}`)) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const meta = JSON.parse(buf.toString('utf8'));

    const pdfCid = meta?.pdf_cid || meta?.cid || null;
    if (!pdfCid) {
      return res.status(404).json({ error: 'Meta encontrado, pero sin pdf_cid' });
    }

    const IPFS_GATEWAY_URL = (process.env.IPFS_GATEWAY_URL || 'http://127.0.0.1:8080').replace(/\/+$/, '');
    return res.redirect(`${IPFS_GATEWAY_URL}/ipfs/${pdfCid}`);
  } catch (e) {
    console.error('redirect by-hash error:', e);
    return res.status(502).json({ error: 'No se pudo resolver el CID (índice)' });
  }
});

// GET /api/download/by-cid/:cid
// Hace streaming directo del CID sin pasar por índice/BD.
app.get('/api/download/by-cid/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const filename = `cert-${cid.slice(0, 8)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    for await (const chunk of ipfs.cat(cid)) {
      res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error('download by-cid error:', e);
    return res.status(502).json({ error: 'No se pudo descargar desde IPFS (by-cid)' });
  }
});

// GET /api/ipfs/diagnose - Diagnóstico de nodos IPFS
app.get('/api/ipfs/diagnose', async (req, res) => {
  const results = [];

  for (const endpoint of IPFS_ENDPOINTS) {
    try {
      const client = createIpfsClient({ url: endpoint });
      const start = Date.now();

      // Test 1: Version
      const version = await client.version();

      // Test 2: CID del índice
      let indexCid = null;
      try {
        const stat = await client.files.stat('/cert-index', { hash: true });
        indexCid = (stat.cid || stat.hash || '').toString();
      } catch (e) {
        indexCid = `Error: ${e.message}`;
      }

      const elapsed = Date.now() - start;

      results.push({
        endpoint,
        status: 'OK',
        version: version.version,
        indexCid,
        responseTime: `${elapsed}ms`
      });
    } catch (e) {
      results.push({
        endpoint,
        status: 'FAIL',
        error: e.message
      });
    }
  }

  res.json({ nodes: results });
});

// ============================================================================
// SISTEMA DE AUDITORÍA CON CADENA HISTÓRICA INMUTABLE
// Agregar al FINAL de backend/index.mjs (antes de app.listen)
// ============================================================================
//
// Arquitectura:
// - Wallet FROM: serverAcct (ALGOD_MNEMONIC en .env) - FIRMA
// - Wallet TO: AUDIT_RECEIVER_WALLET (nueva en .env) - RECIBE
// - IPFS: Cadena histórica (cada CID contiene TODO el histórico)
// - Blockchain: NOTE con AUDIT|v1|<hash>|<cid>|<timestamp>|<admin_wallet>
//
// Ejemplo:
// Lunes: Registro 2 usuarios → CID_1 (contiene 2 usuarios)
// Martes: Registro 3 usuarios → CID_2 (contiene 5 usuarios: 2 del lunes + 3 nuevos)
// Miércoles: Elimino 1 usuario → CID_3 (contiene 6 acciones: 5 anteriores + 1 eliminación)
//
// ============================================================================

// Variable global para wallet receptora de auditoría
const AUDIT_RECEIVER_WALLET = (process.env.AUDIT_RECEIVER_WALLET || '').trim();

if (AUDIT_RECEIVER_WALLET && algosdk.isValidAddress(AUDIT_RECEIVER_WALLET)) {
  console.log('[Audit-Init] ✅ Wallet receptora configurada:', AUDIT_RECEIVER_WALLET);
} else {
  console.warn('[Audit-Init] ⚠️  AUDIT_RECEIVER_WALLET no configurada en .env');
}

// ============================================================================
// HELPER: Buscar última transacción de auditoría
// ============================================================================
// ============================================================================
// FIX: getLastAuditTransaction - Usar el MISMO indexer que ya funciona
// ============================================================================
// 
// INSTRUCCIONES:
// 1. Busca en backend/index.mjs la función `getLastAuditTransaction()`
// 2. Reemplázala COMPLETA con este código
// 3. Reinicia el backend
//
// CAMBIOS:
// - Usa `indexerClient` que YA está definido en index.mjs (línea ~850)
// - Mismo patron que usas para buscar PDFs (lookup-by-hash)
// ============================================================================

async function getLastAuditTransaction() {
  if (!AUDIT_RECEIVER_WALLET) {
    console.log('[Audit] ⚠️  AUDIT_RECEIVER_WALLET no configurada');
    return null;
  }

  try {
    console.log('[Audit] 🔍 Buscando última auditoría en wallet:', AUDIT_RECEIVER_WALLET);

    // Buscar transacciones a la wallet receptora (últimos 90 días)
    const afterDate = new Date(Date.now() - 90 * 24 * 3600e3);
    const afterIso = afterDate.toISOString();

    console.log('[Audit] 📅 Buscando desde:', afterIso);

    // ✅ USAR EL MISMO INDEXER QUE YA FUNCIONA PARA PDFs
    const resp = await indexerClient
      .lookupAccountTransactions(AUDIT_RECEIVER_WALLET)
      .txType('pay')
      .afterTime(afterIso)
      .limit(1000)
      .do();

    console.log('[Audit] 📊 Total transacciones encontradas:', resp.transactions?.length || 0);

    const txs = resp.transactions || [];
    
    if (txs.length === 0) {
      console.log('[Audit] ℹ️  No hay transacciones en esta wallet');
      return null;
    }

    // Ordenar por round DESCENDENTE (más reciente primero)
    txs.sort((a, b) => (b['confirmed-round'] || 0) - (a['confirmed-round'] || 0));

    console.log('[Audit] 🔍 Analizando transacciones...');

    // Buscar la PRIMERA transacción con NOTE "AUDIT|v1|"
    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const noteB64 = tx.note;
      
      if (!noteB64) continue;

      let noteUtf8;
      try {
        noteUtf8 = Buffer.from(noteB64, 'base64').toString('utf8');
      } catch (err) {
        continue;
      }

      console.log(`[Audit]   [${i}] Round ${tx['confirmed-round']} - NOTE: ${noteUtf8.substring(0, 50)}...`);
      
      if (noteUtf8.startsWith('AUDIT|v1|')) {
        // Parsear: AUDIT|v1|<hash>|<cid>|<timestamp>|<admin_wallet>
        const parts = noteUtf8.split('|');
        
        if (parts.length < 4) {
          console.log(`[Audit]   ⚠️  NOTE inválido (faltan partes):`, noteUtf8);
          continue;
        }

        const cid = parts[3];
        const hash = parts[2];
        
        console.log('\n[Audit] ✅ ¡Encontrada última auditoría!');
        console.log('[Audit]   TxID:', tx.id);
        console.log('[Audit]   Round:', tx['confirmed-round']);
        console.log('[Audit]   CID:', cid);
        console.log('[Audit]   Hash:', hash.substring(0, 16) + '...');
        console.log('');
        
        return {
          txId: tx.id,
          round: tx['confirmed-round'],
          hash: hash || null,
          cid: cid || null,
          timestamp: parts[4] ? parseInt(parts[4]) : null,
          adminWallet: parts[5] || null,
          noteUtf8: noteUtf8
        };
      }
    }

    console.log('[Audit] ℹ️  No se encontró ninguna transacción con AUDIT|v1|');
    return null;

  } catch (error) {
    console.error('[Audit] ❌ Error buscando auditoría:', error.message);
    console.error('[Audit] Stack:', error.stack);
    return null;
  }
}


// ============================================================================
// HELPER: Descargar JSON de IPFS
// ============================================================================

async function downloadAuditJSON(cid) {
  try {
    const chunks = [];
    for await (const chunk of ipfs.cat(cid)) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    console.error('[Audit] Error descargando JSON:', error);
    return null;
  }
}

// ============================================================================
// POST /api/audit/register-action
// Registra una acción y construye cadena histórica
// ============================================================================

app.post('/api/audit/register-action', express.json(), async (req, res) => {
  try {
    console.log('\n════════════════════════════════════════════════');
    console.log('🔐 AUDITORÍA: Registro de Acción');
    console.log('════════════════════════════════════════════════\n');

    // Validar configuración
    if (!serverAcct) {
      return res.status(501).json({ 
        error: 'Auditoría deshabilitada: falta ALGOD_MNEMONIC' 
      });
    }

    if (!AUDIT_RECEIVER_WALLET) {
      return res.status(501).json({ 
        error: 'Auditoría deshabilitada: falta AUDIT_RECEIVER_WALLET' 
      });
    }

    const { 
      action,         // 'register' | 'delete' | 'update'
      adminEmail,
      adminWallet,
      targetWallet,
      targetEmail,
      targetRole
    } = req.body;

    if (!action || !adminEmail) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    console.log('📋 Datos:');
    console.log('  Action:', action);
    console.log('  Admin:', adminEmail);
    console.log('  Target:', targetWallet || 'N/A');

    // ════════════════════════════════════════════════════════════════════
    // PASO 1: Buscar auditoría anterior
    // ════════════════════════════════════════════════════════════════════

    console.log('\n🔍 PASO 1: Buscar auditoría anterior');
    const lastAudit = await getLastAuditTransaction();

    let previousActions = [];
    let previousCid = null;
    let previousTxId = null;

    if (lastAudit && lastAudit.cid) {
      console.log('  ✅ Encontrada CID anterior:', lastAudit.cid);
      
      const previousJSON = await downloadAuditJSON(lastAudit.cid);
      
      if (previousJSON && previousJSON.actions) {
        previousActions = previousJSON.actions;
        previousCid = lastAudit.cid;
        previousTxId = lastAudit.txId;
        
        console.log('  ✅ Acciones anteriores:', previousActions.length);
      }
    } else {
      console.log('  ℹ️  Primera auditoría');
    }

    // ════════════════════════════════════════════════════════════════════
    // PASO 2: Crear nueva acción
    // ════════════════════════════════════════════════════════════════════

    console.log('\n📝 PASO 2: Crear nueva acción');

    const newAction = {
      action_type: action,
      timestamp: new Date().toISOString(),
      timestamp_unix: Date.now(),
      admin: {
        email: adminEmail,
        wallet: adminWallet || null
      },
      target_user: {
        wallet: targetWallet || null,
        email: targetEmail || null,
        role: targetRole || null
      }
    };

    console.log('  ✅ Acción creada');

    // ════════════════════════════════════════════════════════════════════
    // PASO 3: Construir JSON con TODA la cadena histórica
    // ════════════════════════════════════════════════════════════════════

    console.log('\n🔗 PASO 3: Construir cadena histórica');

    const auditRecord = {
      version: 'AUDIT-v1',
      audit_type: 'user_management',
      created_at: new Date().toISOString(),
      
      // TODA la cadena histórica: acciones anteriores + nueva
      actions: [
        ...previousActions,
        newAction
      ],
      
      // Referencias para verificación
      previous_audit_cid: previousCid,
      previous_tx_id: previousTxId,
      
      // Metadatos
      total_actions: previousActions.length + 1,
      chain_length: previousActions.length + 1
    };

    console.log('  ✅ Histórico completo:');
    console.log('     Total acciones:', auditRecord.total_actions);
    console.log('     CID anterior:', previousCid || 'null (primera)');

    // ════════════════════════════════════════════════════════════════════
    // PASO 4: Subir a IPFS
    // ════════════════════════════════════════════════════════════════════

    console.log('\n📤 PASO 4: Subir a IPFS');

    const jsonBuffer = Buffer.from(JSON.stringify(auditRecord, null, 2), 'utf8');
    const added = await ipfs.add(jsonBuffer, { pin: true });
    const newCid = added.cid.toString();

    console.log('  ✅ CID:', newCid);

    // ════════════════════════════════════════════════════════════════════
    // PASO 5: Calcular hash
    // ════════════════════════════════════════════════════════════════════

    console.log('\n🔐 PASO 5: Hash SHA-256');

    const hash = crypto.createHash('sha256').update(jsonBuffer).digest('hex').toLowerCase();

    console.log('  ✅ Hash:', hash.substring(0, 16) + '...');

    // ════════════════════════════════════════════════════════════════════
    // PASO 6: Construir NOTE
    // ════════════════════════════════════════════════════════════════════

    console.log('\n📝 PASO 6: Construir NOTE');

    const timestamp = Date.now();
    const noteStr = `AUDIT|v1|${hash}|${newCid}|${timestamp}|${adminWallet || 'SYSTEM'}`;
    const note = new Uint8Array(Buffer.from(noteStr, 'utf8'));

    console.log('  NOTE:', noteStr.substring(0, 60) + '...');

    // ════════════════════════════════════════════════════════════════════
    // PASO 7: Firmar transacción
    // ════════════════════════════════════════════════════════════════════

    console.log('\n✍️  PASO 7: Firmar transacción');
    console.log('  FROM:', serverAcct.addr);
    console.log('  TO:', AUDIT_RECEIVER_WALLET);

    const sp = await buildSuggestedParamsFailover();

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from: serverAcct.addr,
      to: AUDIT_RECEIVER_WALLET,
      amount: 0,
      note,
      suggestedParams: sp,
    });

    const stxn = txn.signTxn(serverAcct.sk);

    // ════════════════════════════════════════════════════════════════════
    // PASO 8: Enviar a blockchain
    // ════════════════════════════════════════════════════════════════════

    console.log('\n📤 PASO 8: Enviar a Algorand');

    let txId;
    try {
      const result = await sendRawTransaction(stxn);
      txId = result.txId;
      console.log('  ✅ TxID:', txId);
    } catch (e) {
      const poolError = e?.response?.body?.message || e?.message || String(e);
      console.error('  ❌ Rechazada:', poolError);
      return res.status(400).json({
        ok: false,
        error: 'Transacción rechazada',
        poolError,
      });
    }

    // ════════════════════════════════════════════════════════════════════
    // PASO 9: Confirmar
    // ════════════════════════════════════════════════════════════════════

    console.log('\n⏳ PASO 9: Confirmar...');

    const conf = await confirmRoundWithFallback({
      txId,
      waitSeconds: 20,
    });

    console.log('\n════════════════════════════════════════════════');
    
    if (conf.pending) {
      console.log('⚠️  PENDIENTE');
      console.log('════════════════════════════════════════════════\n');
      
      return res.status(202).json({
        ok: true,
        txId,
        cid: newCid,
        hash,
        round: null,
        pending: true,
        total_actions: auditRecord.total_actions
      });
    }

    console.log('✅ CONFIRMADA');
    console.log('  Round:', conf.round);
    console.log('  Confirmado por:', conf.confirmedBy);
    console.log('  Total acciones en cadena:', auditRecord.total_actions);
    console.log('════════════════════════════════════════════════\n');

    return res.json({
      ok: true,
      txId,
      cid: newCid,
      hash,
      round: conf.round,
      confirmedBy: conf.confirmedBy,
      total_actions: auditRecord.total_actions,
      previous_cid: previousCid
    });

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    console.log('════════════════════════════════════════════════\n');
    
    return res.status(500).json({ 
      error: 'Error registrando auditoría',
      detail: error?.message || String(error)
    });
  }
});

// ============================================================================
// GET /api/audit/get-full-history
// Obtiene el histórico COMPLETO desde el último CID
// ============================================================================

app.get('/api/audit/get-full-history', async (req, res) => {
  try {
    console.log('[Audit-History] 📚 Obteniendo histórico completo');

    // Buscar última auditoría
    const lastAudit = await getLastAuditTransaction();

    if (!lastAudit || !lastAudit.cid) {
      return res.json({
        ok: true,
        actions: [],
        total: 0,
        message: 'No hay auditorías registradas'
      });
    }

    console.log('[Audit-History] ✅ Última auditoría encontrada');
    console.log('[Audit-History]   CID:', lastAudit.cid);
    console.log('[Audit-History]   TxID:', lastAudit.txId);

    // Descargar JSON del último CID
    const auditJSON = await downloadAuditJSON(lastAudit.cid);

    if (!auditJSON || !auditJSON.actions) {
      return res.status(404).json({
        ok: false,
        error: 'No se pudo descargar el JSON de auditoría'
      });
    }

    console.log('[Audit-History] ✅ Histórico descargado');
    console.log('[Audit-History]   Total acciones:', auditJSON.actions.length);

    return res.json({
      ok: true,
      actions: auditJSON.actions,
      total: auditJSON.actions.length,
      last_cid: lastAudit.cid,
      last_tx_id: lastAudit.txId,
      last_round: lastAudit.round,
      chain_length: auditJSON.chain_length || auditJSON.actions.length
    });

  } catch (error) {
    console.error('[Audit-History] ❌ Error:', error);
    return res.status(500).json({ 
      error: 'Error obteniendo histórico',
      detail: error?.message || String(error)
    });
  }
});

// ============================================================================
// GET /api/audit/verify-chain
// Verifica la integridad de la cadena histórica
// ============================================================================

app.get('/api/audit/verify-chain', async (req, res) => {
  try {
    console.log('[Audit-Verify] 🔍 Verificando integridad de cadena');

    const lastAudit = await getLastAuditTransaction();

    if (!lastAudit || !lastAudit.cid) {
      return res.json({
        ok: true,
        valid: true,
        message: 'No hay cadena para verificar'
      });
    }

    // Descargar JSON actual
    const currentJSON = await downloadAuditJSON(lastAudit.cid);

    if (!currentJSON) {
      return res.status(404).json({
        ok: false,
        valid: false,
        error: 'No se pudo descargar JSON actual'
      });
    }

    // Verificar que tenga el formato correcto
    if (!currentJSON.version || !currentJSON.actions || !Array.isArray(currentJSON.actions)) {
      return res.json({
        ok: false,
        valid: false,
        error: 'Formato de JSON inválido'
      });
    }

    console.log('[Audit-Verify] ✅ JSON válido');
    console.log('[Audit-Verify]   Versión:', currentJSON.version);
    console.log('[Audit-Verify]   Total acciones:', currentJSON.actions.length);

    // Si hay referencia a anterior, verificar que exista
    if (currentJSON.previous_audit_cid) {
      console.log('[Audit-Verify] 🔗 Verificando CID anterior:', currentJSON.previous_audit_cid);
      
      try {
        const previousJSON = await downloadAuditJSON(currentJSON.previous_audit_cid);
        
        if (previousJSON) {
          console.log('[Audit-Verify] ✅ CID anterior válido');
        } else {
          console.log('[Audit-Verify] ⚠️  CID anterior no accesible');
        }
      } catch (e) {
        console.log('[Audit-Verify] ⚠️  Error accediendo CID anterior');
      }
    }

    return res.json({
      ok: true,
      valid: true,
      total_actions: currentJSON.actions.length,
      has_previous: !!currentJSON.previous_audit_cid,
      previous_cid: currentJSON.previous_audit_cid || null,
      last_cid: lastAudit.cid,
      last_tx_id: lastAudit.txId
    });

  } catch (error) {
    console.error('[Audit-Verify] ❌ Error:', error);
    return res.status(500).json({ 
      error: 'Error verificando cadena',
      detail: error?.message || String(error)
    });
  }
});

app.get('/api/audit/debug-transactions', async (req, res) => {
  try {
    if (!AUDIT_RECEIVER_WALLET) {
      return res.json({ 
        error: 'AUDIT_RECEIVER_WALLET no configurada' 
      });
    }

    console.log('\n════════════════════════════════════════════════');
    console.log('🔍 DEBUG: Analizando transacciones de auditoría');
    console.log('════════════════════════════════════════════════\n');

    const afterDate = new Date(Date.now() - 90 * 24 * 3600e3);
    const afterIso = afterDate.toISOString();

    console.log('Wallet receptora:', AUDIT_RECEIVER_WALLET);
    console.log('Buscando desde:', afterIso);

    const resp = await indexerClient
      .lookupAccountTransactions(AUDIT_RECEIVER_WALLET)
      .txType('pay')
      .afterTime(afterIso)
      .limit(1000)
      .do();

    const txs = resp.transactions || [];
    
    console.log('Total transacciones:', txs.length);

    const analysis = {
      wallet: AUDIT_RECEIVER_WALLET,
      total_transactions: txs.length,
      transactions: [],
      audit_transactions: [],
      other_transactions: []
    };

    // Ordenar por round
    txs.sort((a, b) => (b['confirmed-round'] || 0) - (a['confirmed-round'] || 0));

    for (const tx of txs) {
      const txInfo = {
        txId: tx.id,
        round: tx['confirmed-round'],
        from: tx.sender,
        to: tx['payment-transaction']?.receiver,
        amount: tx['payment-transaction']?.amount || 0,
        hasNote: !!tx.note,
        note: null,
        noteRaw: tx.note || null
      };

      if (tx.note) {
        try {
          const noteUtf8 = Buffer.from(tx.note, 'base64').toString('utf8');
          txInfo.note = noteUtf8;

          if (noteUtf8.startsWith('AUDIT|v1|')) {
            const parts = noteUtf8.split('|');
            txInfo.parsed = {
              version: parts[1],
              hash: parts[2],
              cid: parts[3],
              timestamp: parts[4],
              adminWallet: parts[5]
            };
            analysis.audit_transactions.push(txInfo);
          } else {
            analysis.other_transactions.push(txInfo);
          }
        } catch (err) {
          txInfo.note = '[Error decodificando]';
          analysis.other_transactions.push(txInfo);
        }
      } else {
        analysis.other_transactions.push(txInfo);
      }

      analysis.transactions.push(txInfo);
    }

    console.log('\n📊 Resumen:');
    console.log('  Total:', analysis.total_transactions);
    console.log('  Con AUDIT|v1|:', analysis.audit_transactions.length);
    console.log('  Otras:', analysis.other_transactions.length);

    if (analysis.audit_transactions.length > 0) {
      console.log('\n✅ Transacciones de auditoría encontradas:');
      analysis.audit_transactions.forEach((tx, i) => {
        console.log(`  [${i}] Round ${tx.round} - CID: ${tx.parsed?.cid}`);
      });
    }

    console.log('\n════════════════════════════════════════════════\n');

    return res.json(analysis);

  } catch (error) {
    console.error('Error en debug:', error);
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});


// ============================================================================
// ENDPOINT DE DIAGNÓSTICO DE AUDITORÍA
// ============================================================================
//
// INSTRUCCIONES:
// 1. Copia este código AL FINAL de backend/index.mjs (antes de app.listen)
// 2. Reinicia el backend
// 3. Visita: http://192.168.1.100:3001/api/audit/diagnose
//
// ============================================================================

app.get('/api/audit/diagnose', async (req, res) => {
  try {
    console.log('\n════════════════════════════════════════════════');
    console.log('🔍 DIAGNÓSTICO COMPLETO DE AUDITORÍA');
    console.log('════════════════════════════════════════════════\n');

    const report = {
      timestamp: new Date().toISOString(),
      config: {},
      indexer: {},
      transactions: [],
      summary: {}
    };

    // ═══════════════════════════════════════════════════════════
    // 1. CONFIGURACIÓN
    // ═══════════════════════════════════════════════════════════

    report.config = {
      audit_receiver_wallet: AUDIT_RECEIVER_WALLET || 'NO CONFIGURADA',
      has_signer: !!serverAcct,
      signer_wallet: serverAcct?.addr || 'NO CONFIGURADA',
      indexer_url: INDEXER_URL
    };

    console.log('📋 Configuración:');
    console.log('  Wallet Receptora:', report.config.audit_receiver_wallet);
    console.log('  Wallet Firmante:', report.config.signer_wallet);
    console.log('  Indexer URL:', report.config.indexer_url);

    if (!AUDIT_RECEIVER_WALLET) {
      report.summary.error = 'AUDIT_RECEIVER_WALLET no configurada';
      return res.json(report);
    }

    // ═══════════════════════════════════════════════════════════
    // 2. PROBAR INDEXER
    // ═══════════════════════════════════════════════════════════

    console.log('\n🔌 Probando conexión con Indexer...');

    try {
      const health = await indexerClient.makeHealthCheck().do();
      report.indexer.status = 'OK';
      report.indexer.health = health;
      console.log('  ✅ Indexer respondió correctamente');
    } catch (error) {
      report.indexer.status = 'ERROR';
      report.indexer.error = error.message;
      console.error('  ❌ Indexer falló:', error.message);
    }

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR TRANSACCIONES
    // ═══════════════════════════════════════════════════════════

    console.log('\n🔍 Buscando transacciones...');

    const afterDate = new Date(Date.now() - 90 * 24 * 3600e3);
    const afterIso = afterDate.toISOString();

    console.log('  Wallet:', AUDIT_RECEIVER_WALLET);
    console.log('  Desde:', afterIso);

    const resp = await indexerClient
      .lookupAccountTransactions(AUDIT_RECEIVER_WALLET)
      .txType('pay')
      .afterTime(afterIso)
      .limit(1000)
      .do();

    const txs = resp.transactions || [];
    console.log('  Total encontradas:', txs.length);

    // ═══════════════════════════════════════════════════════════
    // 4. ANALIZAR CADA TRANSACCIÓN
    // ═══════════════════════════════════════════════════════════

    console.log('\n📊 Analizando transacciones...\n');

    let auditCount = 0;
    let otherCount = 0;

    for (let i = 0; i < txs.length; i++) {
      const tx = txs[i];
      const txInfo = {
        index: i,
        txId: tx.id,
        round: tx['confirmed-round'],
        from: tx.sender,
        to: tx['payment-transaction']?.receiver,
        amount: tx['payment-transaction']?.amount || 0,
        hasNote: !!tx.note,
        noteRaw: tx.note || null,
        noteUtf8: null,
        isAudit: false,
        parsed: null
      };

      if (tx.note) {
        try {
          const noteUtf8 = Buffer.from(tx.note, 'base64').toString('utf8');
          txInfo.noteUtf8 = noteUtf8;

          console.log(`[${i}] Round ${tx['confirmed-round']}`);
          console.log(`    NOTE: ${noteUtf8.substring(0, 60)}...`);

          if (noteUtf8.startsWith('AUDIT|v1|')) {
            const parts = noteUtf8.split('|');
            txInfo.isAudit = true;
            txInfo.parsed = {
              version: parts[1],
              hash: parts[2],
              cid: parts[3],
              timestamp: parts[4],
              adminWallet: parts[5]
            };
            auditCount++;
            console.log(`    ✅ ES AUDITORÍA - CID: ${parts[3]}`);
          } else {
            otherCount++;
            console.log(`    ℹ️  Otra transacción`);
          }
        } catch (err) {
          txInfo.noteUtf8 = '[Error decodificando]';
          otherCount++;
          console.log(`[${i}] ⚠️  Error decodificando NOTE`);
        }
      } else {
        otherCount++;
        console.log(`[${i}] Round ${tx['confirmed-round']} - Sin NOTE`);
      }

      report.transactions.push(txInfo);
      console.log(''); // Línea en blanco
    }

    // ═══════════════════════════════════════════════════════════
    // 5. RESUMEN
    // ═══════════════════════════════════════════════════════════

    report.summary = {
      total_transactions: txs.length,
      audit_transactions: auditCount,
      other_transactions: otherCount,
      has_audits: auditCount > 0
    };

    console.log('\n════════════════════════════════════════════════');
    console.log('📈 RESUMEN');
    console.log('════════════════════════════════════════════════');
    console.log('  Total transacciones:', report.summary.total_transactions);
    console.log('  Con AUDIT|v1|:', report.summary.audit_transactions);
    console.log('  Otras:', report.summary.other_transactions);
    console.log('════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════════════
    // 6. DIAGNÓSTICO
    // ═══════════════════════════════════════════════════════════

    if (auditCount === 0) {
      console.log('⚠️  DIAGNÓSTICO: No hay transacciones de auditoría');
      console.log('');
      console.log('Posibles causas:');
      console.log('1. Las transacciones aún no se han confirmado');
      console.log('2. El NOTE no tiene el formato correcto');
      console.log('3. Se están enviando a otra wallet');
      console.log('');
      console.log('Verifica:');
      console.log('- AUDIT_RECEIVER_WALLET en .env');
      console.log('- Logs del backend al registrar usuario');
      console.log('- Explorer de Algorand');
    } else {
      console.log('✅ Sistema funcionando correctamente');
      console.log(`   Se encontraron ${auditCount} auditorías`);
    }

    return res.json(report);

  } catch (error) {
    console.error('\n❌ ERROR EN DIAGNÓSTICO:', error);
    console.log('════════════════════════════════════════════════\n');
    
    return res.status(500).json({ 
      error: error.message,
      stack: error.stack
    });
  }
});



// ---------- start server ----------
app.listen(PORT, () => {
  console.log(`[ALGOD_URL] ${ALGOD_URL}`);
  console.log(`[INDEXER_URL] ${INDEXER_URL}`);
  console.log(`✅ Backend corriendo en http://localhost:${PORT}`);
});
