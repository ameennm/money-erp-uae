import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const db = new Databases(client);

async function run() {
    const d = await db.getDocument('money_erp_db', 'transactions', '699ac267002b163dd745');
    console.log("Original:", d);

    // We can only update fields, but maybe we can't send null for double fields?
    // The issue was "Unknown attribute: rate_aed_inr".
    // Wait, the API might not like null values for doubles if they were not explicitly initialized correctly,
    // actually doing `{ assigned_to: 'test' }` shouldn't touch `rate_aed_inr`. Appwrite PATCH updates only the fields provided.
    // ... wait! I bet `dbService.updateTransaction(id, data)` is sending the ENTIRE document? Let's check!
}

run().catch(console.error);
