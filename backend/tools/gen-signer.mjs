import algosdk from 'algosdk';

const acct = algosdk.generateAccount();
const addrStr = algosdk.encodeAddress(acct.addr.publicKey);
const mnemonic = algosdk.secretKeyToMnemonic(acct.sk);

console.log('Address:', addrStr);
console.log('Mnemonic:', mnemonic);
