// src/routes/certificates.js
const express = require('express');
const crypto  = require('crypto');
const multer  = require('multer');
const { algod, algosdk } = require('../lib/algod');
const db = require('../lib/db');
const adminKey = require('../middleware/adminKey');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: (Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024) }
});

// Helpers
const isHex64 = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s);
const isAddr  = (a) => {
  try { return algosdk.isValidAddress(a); } catch { return false; }
};

// 1) Parámetros de red (debug)
router.get('/algod/params', async (_req, res) => {
  try {
    const p = await algod.getTransactionParams().do();
    res.json(p);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 2) PREPARE (arma tx 0 ALGO con note=hashHex)
router.post('/cert/prepare', adminKey, async (req, res) => {
  try {
    const { from, hashHex } = req.body;
    if (!isAddr(from)) return res.status(400).json({ error: 'from inválido' });
    if (!isHex64(hashHex)) return res.status(400).json({ error: 'hashHex debe ser SHA-256 (64 hex)' });

    const sp = await algod.getTransactionParams().do();
    sp.flatFee = true; sp.fee = 1000;

    const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      from,
      to: from,
      amount: 0,
      note: Buffer.from(hashHex, 'hex'),
      suggestedParams: sp
    });

    res.json({
      txId: txn.txID().toString(),
      txB64: Buffer.from(txn.toByte()).toString('base64'),
      fee: sp.fee
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3) SUBMIT (recibe firma, envía y guarda en Postgres)
router.post('/cert/submit', adminKey, async (req, res) => {
  try {
    const { signedB64, hashHex, sender, nombre_archivo, cid } = req.body;

    if (!signedB64) return res.status(400).json({ error: 'signedB64 requerido' });
    if (!isHex64(hashHex)) return res.status(400).json({ error: 'hashHex inválido' });
    if (!isAddr(sender)) return res.status(400).json({ error: 'sender inválido' });

    // Idempotencia: si ya existe ese hash, devolvemos la fila
    const prev = await db.query(
      'SELECT * FROM certificados WHERE hash = $1 LIMIT 1',
      [hashHex.toLowerCase()]
    );
    if (prev.rows.length) {
      return res.json({ ok: true, duplicate: true, row: prev.rows[0] });
    }

    const signedBytes = Buffer.from(signedB64, 'base64');
    const { txId } = await algod.sendRawTransaction(signedBytes).do();

    // Esperamos confirmación simple
    let info;
    for (let i = 0; i < 20; i++) {
      info = await algod.pendingTransactionInformation(txId).do();
      if (info['confirmed-round']) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    const round = info?.['confirmed-round'] || null;
    const fecha = new Date().toISOString();

    // Guardamos en tu tabla existente
    await db.query(
      `INSERT INTO certificados (wallet, nombre_archivo, hash, cid, fecha, txid, round)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (hash) DO UPDATE SET
         wallet = EXCLUDED.wallet,
         nombre_archivo = COALESCE(EXCLUDED.nombre_archivo, certificados.nombre_archivo),
         cid = COALESCE(EXCLUDED.cid, certificados.cid),
         fecha = EXCLUDED.fecha,
         txid = EXCLUDED.txid,
         round = EXCLUDED.round`,
      [sender, nombre_archivo || null, hashHex.toLowerCase(), cid || null, fecha, txId, round]
    );

    res.json({ ok: true, txId, confirmedRound: round });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 4) VERIFY por txid (lee on-chain)
router.get('/cert/verify', async (req, res) => {
  try {
    const { txid } = req.query;
    if (!txid) return res.status(400).json({ error: 'txid requerido' });

    const tx = await algod.transactionById(txid).do();
    const noteHex = tx.note ? Buffer.from(tx.note, 'base64').toString('hex') : null;

    res.json({
      txid,
      confirmedRound: tx['confirmed-round'] || null,
      from: tx.sender,
      to: tx['payment-transaction']?.receiver || null,
      amount: tx['payment-transaction']?.amount || 0,
      noteHex
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 5) VERIFY archivo + txid (recalcula SHA-256 y compara)
router.post('/cert/verify-file', upload.single('file'), async (req, res) => {
  try {
    const { txid } = req.body;
    if (!req.file) return res.status(400).json({ error: 'file requerido' });
    if (!txid) return res.status(400).json({ error: 'txid requerido' });

    const hashHex = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const tx = await algod.transactionById(txid).do();
    const noteHex = tx.note ? Buffer.from(tx.note, 'base64').toString('hex') : null;

    res.json({
      match: noteHex === hashHex,
      hashHex, noteHex,
      confirmedRound: tx['confirmed-round'] || null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 6) Consultar por hash (desde TU BD)
router.get('/cert/by-hash/:hashHex', async (req, res) => {
  try {
    const h = req.params.hashHex?.toLowerCase();
    if (!isHex64(h)) return res.status(400).json({ error: 'hash inválido' });
    const r = await db.query('SELECT * FROM certificados WHERE hash = $1 LIMIT 1', [h]);
    res.json(r.rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
