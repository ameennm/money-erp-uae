import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const databases = new Databases(client);
const DB_ID = 'money_erp_db';

// All collections whose documents should be fully deleted
const COLLECTIONS_TO_DELETE = ['transactions', 'aed_conversions', 'expenses', 'credits'];

async function deleteAllInCollection(col) {
    let count = 0;
    while (true) {
        const res = await databases.listDocuments(DB_ID, col, [Query.limit(100)]);
        if (res.documents.length === 0) break;
        await Promise.all(res.documents.map(doc => databases.deleteDocument(DB_ID, col, doc.$id)));
        count += res.documents.length;
    }
    console.log(`✅ Deleted ${count} records from [${col}]`);
}

async function wipeAll() {
    try {
        // 1. Delete all records in specified collections
        for (const col of COLLECTIONS_TO_DELETE) {
            await deleteAllInCollection(col);
        }

        // 2. Reset all agent/distributor balances to 0
        console.log('🔄 Resetting all agent/distributor balances to 0...');
        let agentCount = 0;
        while (true) {
            const res = await databases.listDocuments(DB_ID, 'agents', [Query.limit(100)]);
            if (res.documents.length === 0) break;
            await Promise.all(res.documents.map(doc =>
                databases.updateDocument(DB_ID, 'agents', doc.$id, {
                    inr_balance: 0,
                    sar_balance: 0,
                    aed_balance: 0,
                })
            ));
            agentCount += res.documents.length;
        }
        console.log(`✅ Reset balances for ${agentCount} agent(s)/distributor(s)`);
        console.log('🧹 Database wiped clean! All balances are zero.');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}

wipeAll();
