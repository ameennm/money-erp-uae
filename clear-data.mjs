const E = 'https://sgp.cloud.appwrite.io/v1', P = '6999fff50036fef7a425', DB = 'money_erp_db';
const K = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';
const H = { 'Content-Type': 'application/json', 'X-Appwrite-Project': P, 'X-Appwrite-Key': K };

const get = async (p) => { const r = await fetch(E + p, { headers: H }); return r.json(); };
const del = async (p) => { const r = await fetch(E + p, { method: 'DELETE', headers: H }); return r.status; };

const clearCollection = async (col) => {
    let total = 0;
    while (true) {
        const data = await get(`/databases/${DB}/collections/${col}/documents?limit=100`);
        if (!data.documents || data.documents.length === 0) break;
        for (const doc of data.documents) {
            const s = await del(`/databases/${DB}/collections/${col}/documents/${doc.$id}`);
            if (s === 204) total++;
            else console.log(`  WARN: status ${s} for ${doc.$id}`);
        }
        console.log(`  [${col}] batch cleared ${data.documents.length}`);
        if (data.documents.length < 100) break;
    }
    console.log(`✅ ${col}: ${total} deleted`);
};

(async () => {
    await clearCollection('transactions');
    await clearCollection('aed_conversions');
    await clearCollection('credits');
    console.log('\n🎉 All test data cleared!');
})();
