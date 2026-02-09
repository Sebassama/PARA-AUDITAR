import algosdk from 'algosdk';

const mnemonic = process.env.ALGOD_MNEMONIC || '';
if (!mnemonic) {
  console.error('Falta ALGOD_MNEMONIC en el entorno');
  process.exit(1);
}
const { addr } = algosdk.mnemonicToSecretKey(mnemonic);
console.log('Signer address:', addr);