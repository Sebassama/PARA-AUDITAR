import 'dotenv/config';
import algosdk from 'algosdk';

const algod = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN || '',
  process.env.ALGOD_URL  || 'http://127.0.0.1:4001',
  ''
);

const acct = algosdk.mnemonicToSecretKey(process.env.ALGOD_MNEMONIC.trim());


const rawParams = await algod.getTransactionParams().do();

const suggestedParams = {
  fee: rawParams.fee,
  firstRound: rawParams.firstValid,
  lastRound: rawParams.lastValid,
  genesisID: rawParams.genesisID,
  genesisHash: rawParams.genesisHash,
  flatFee: rawParams.flatFee,
  minFee: rawParams.minFee,
  consensusVersion: rawParams.consensusVersion
};

const txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
  from:   acct.addr,
  to:     acct.addr,
  amount: 1000,
  note:   new Uint8Array(Buffer.from('ping')),
  suggestedParams
});

const signed = txn.signTxn(acct.sk);
const { txId } = await algod.sendRawTransaction(signed).do();
console.log('[SELF] txId:', txId);

// confirmación breve
let round = (await algod.status().do())['last-round'];
for (let i = 0; i < 20; i++) {
  const ptx = await algod.pendingTransactionInformation(txId).do();
  if (ptx['confirmed-round']) {
    console.log('[SELF] confirmed in round:', ptx['confirmed-round']);
    process.exit(0);
  }
  round++;
  await algod.statusAfterBlock(round).do();
}
console.warn('[SELF] enviado, sin confirmar aún (timeout).');
