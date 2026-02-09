// src/lib/algod.js
require('dotenv').config();
const algosdk = require('algosdk');

if (!process.env.ALGOD_URL || !process.env.ALGOD_TOKEN) {
  throw new Error('Faltan ALGOD_URL o ALGOD_TOKEN en .env');
}

const algod = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN,
  process.env.ALGOD_URL,
  '' // basePath extra (vacío)
);

module.exports = { algod, algosdk };
