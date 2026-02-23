import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const databases = new Databases(client);
const DB_ID = 'money_erp_db';
const COL = 'transactions';
const CONV_COL = 'aed_conversions';

async function deleteAll() {
    try {
        let hasMore = true;
        while (hasMore) {
            const res = await databases.listDocuments(DB_ID, COL);
            if (res.documents.length === 0) break;
            for (let doc of res.documents) {
                await databases.deleteDocument(DB_ID, COL, doc.$id);
                console.log(`Deleted TX ${doc.$id}`);
            }
        }
        console.log('✅ Deleted all transactions');

        hasMore = true;
        while (hasMore) {
            const res = await databases.listDocuments(DB_ID, CONV_COL);
            if (res.documents.length === 0) break;
            for (let doc of res.documents) {
                await databases.deleteDocument(DB_ID, CONV_COL, doc.$id);
                console.log(`Deleted CONV ${doc.$id}`);
            }
        }
        console.log('✅ Deleted all conversions');
    } catch (e) {
        console.error('❌ Failed:', e.message);
    }
}
deleteAll();
