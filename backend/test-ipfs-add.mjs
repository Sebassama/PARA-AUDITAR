import dotenv from 'dotenv';
dotenv.config();
import ipfs from './indexing.mjs';

async function testIpfsAdd() {
    console.log('--- Testing IPFS Add ---');
    try {
        const buffer = Buffer.from('Test content for IPFS add ' + Date.now());
        console.log('Adding buffer to IPFS...');
        const result = await ipfs.add(buffer);
        console.log('Result:', result);

        if (result && result.cid) {
            console.log('✅ IPFS Add successful. CID:', result.cid.toString());
        } else {
            console.error('❌ IPFS Add returned invalid result:', result);
        }
    } catch (e) {
        console.error('❌ IPFS Add failed:', e);
    }
}

testIpfsAdd();
