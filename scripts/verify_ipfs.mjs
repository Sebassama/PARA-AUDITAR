import { create } from 'ipfs-http-client';

const ENDPOINTS = [
    'http://192.168.1.194:9095',
    'http://192.168.1.193:9095',
    'http://192.168.1.192:9095'
];

async function testEndpoint(url) {
    console.log(`\n--- Testing ${url} ---`);
    try {
        const client = create({ url: url.replace(/\/+$/, '') + '/api/v0' });
        const id = await client.id();
        console.log('✅ ID:', id.id);

        const data = Buffer.from('TEST IPFS UPLOAD ' + Date.now());

        // Test 1: ipfs.add
        try {
            console.log('Testing ipfs.add...');
            const resAdd = await client.add(data);
            console.log('ipfs.add result:', resAdd);
        } catch (e) {
            console.error('❌ ipfs.add returned error:', e.message);
        }

        // Test 2: ipfs.addAll with array
        try {
            console.log('Testing ipfs.addAll with [data]...');
            const results = [];
            for await (const r of client.addAll([data])) {
                results.push(r);
            }
            console.log('ipfs.addAll result:', results);
        } catch (e) {
            console.error('❌ ipfs.addAll returned error:', e.message);
        }

        // Test 3: ipfs.addAll with [{ content }]
        try {
            console.log('Testing ipfs.addAll with [{content: data}]...');
            const results = [];
            for await (const r of client.addAll([{ content: data }])) {
                results.push(r);
            }
            console.log('ipfs.addAll [{content}] result:', results);
        } catch (e) {
            console.error('❌ ipfs.addAll [{content}] returned error:', e.message);
        }

    } catch (e) {
        console.error(`❌ Could not connect or critical failure: ${e.message}`);
    }
}

async function run() {
    for (const ep of ENDPOINTS) {
        await testEndpoint(ep);
    }
}

run();
