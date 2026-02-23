import { Client, Databases, ID } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const db = new Databases(client);

// Check if Employee One already exists
const res = await db.listDocuments('money_erp_db', 'employees');
const existing = res.documents.find(d => d.email === 'employee@moneytransfer.com');

if (existing) {
    console.log('Employee One already exists:', existing);
} else {
    const doc = await db.createDocument('money_erp_db', 'employees', ID.unique(), {
        name: 'Employee One',
        email: 'employee@moneytransfer.com',
        role: 'employee',
    });
    console.log('Created Employee One:', doc.$id);
}

console.log('\nAll employees now:');
const final = await db.listDocuments('money_erp_db', 'employees');
final.documents.forEach(d => console.log(`  - ${d.name} | ${d.email} | role: ${d.role}`));
