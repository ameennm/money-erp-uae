import { Client, Databases, Query } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const databases = new Databases(client);
const DB_ID = 'money_erp_db';

const COLLECTIONS = ['transactions', 'aed_conversions', 'expenses'];

async function deleteAll() {
    try {
        for (const col of COLLECTIONS) {
            let count = 0;
            while (true) {
                const res = await databases.listDocuments(DB_ID, col);
                if (res.documents.length === 0) break;
                for (let doc of res.documents) {
                    await databases.deleteDocument(DB_ID, col, doc.$id);
                    count++;
                }
            }
            console.log(`✅ Deleted ${count} records from ${col}`);
        }

        // Reset all agent and distributor balances to 0 instead of deleting them
        console.log('🔄 Resetting agent/distributor balances...');
        let agentCount = 0;
        let agentCursor = null;
        while (true) {
            const queries = agentCursor ? [Query.cursorAfter(agentCursor)] : [];
            const res = await databases.listDocuments(DB_ID, 'agents', queries);
            if (res.documents.length === 0) break;

            for (let doc of res.documents) {
                await databases.updateDocument(DB_ID, 'agents', doc.$id, {
                    inr_balance: 0
                });
                agentCount++;
                agentCursor = doc.$id;
            }
        }
        console.log(`✅ Reset balances for ${agentCount} agents/distributors`);
        console.log('🧹 All data wiped clean!');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}
deleteAll();

