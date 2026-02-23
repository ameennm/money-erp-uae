import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const db = new Databases(client);

async function run() {
    // 1. Update the collection to allow all users to read/update, and turn off Document Security
    const c = await db.updateCollection('money_erp_db', 'transactions', 'Transactions',
        ['read("users")', 'create("users")', 'update("users")', 'delete("users")'],
        false,
        true
    );
    console.log('Updated collection permissions:', c.documentSecurity);

    // 2. Fetch all existing transaction documents and clear out explicit permissions
    let i = 0;
    const res = await db.listDocuments('money_erp_db', 'transactions');
    for (const doc of res.documents) {
        try {
            await db.updateDocument('money_erp_db', 'transactions', doc.$id, {}, ['read("users")', 'update("users")', 'delete("users")']);
            i++;
        } catch (err) {
            console.error('Failed to update doc permissions:', doc.$id, err.message);
        }
    }
    console.log(`Updated permissions on ${i} old documents.`);
}

run().catch(console.error);
