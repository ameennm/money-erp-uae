/**
 * MoneyFlow ERP — Appwrite Database & Collections Setup
 * Run once:  node setup-db.mjs
 */

const ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
const PROJECT_ID = '6999fff50036fef7a425';
const API_KEY = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';

const DB_ID = 'money_erp_db';
const DB_NAME = 'MoneyFlow ERP DB';

const HEADERS = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
};

// ── Utility ───────────────────────────────────────────────────────────────────
async function api(method, path, body) {
    const res = await fetch(`${ENDPOINT}${path}`, {
        method,
        headers: HEADERS,
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json() };
}

async function createDB() {
    const { status, data } = await api('POST', '/databases', {
        databaseId: DB_ID,
        name: DB_NAME,
    });
    if (status === 201) console.log(`✅  Database created: ${DB_ID}`);
    else if (status === 409) console.log(`⚠️  Database already exists: ${DB_ID}`);
    else throw new Error(`DB create failed: ${data.message}`);
}

async function createCollection(collectionId, name) {
    const { status, data } = await api('POST', `/databases/${DB_ID}/collections`, {
        collectionId,
        name,
        permissions: ['read("any")', 'create("any")', 'update("any")', 'delete("any")'],
        documentSecurity: false,
    });
    if (status === 201) console.log(`  ✅  Collection: ${collectionId}`);
    else if (status === 409) console.log(`  ⚠️  Collection exists: ${collectionId}`);
    else throw new Error(`Collection '${collectionId}' failed: ${data.message}`);
}

async function addAttr(collectionId, type, body) {
    const { status, data } = await api(
        'POST',
        `/databases/${DB_ID}/collections/${collectionId}/attributes/${type}`,
        body
    );
    if (status === 202) {
        // success (attribute creation is async in Appwrite)
    } else if (status === 409) {
        // already exists — fine
    } else {
        console.warn(`    ⚠️  Attr '${body.key}' on '${collectionId}': ${data.message}`);
    }
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('\n🚀  MoneyFlow ERP — Setting up Appwrite Database\n');

// 1. Create database
await createDB();

// ─────────────────────────────────────────────────────────────────────────────
// 2. TRANSACTIONS collection
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📦  Creating collections & attributes …\n');
await createCollection('transactions', 'Transactions');

const txAttrs = [
    ['string', { key: 'tx_id', size: 64, required: false }],
    ['string', { key: 'client_name', size: 128, required: true }],
    ['string', { key: 'agent_id', size: 64, required: false }],
    ['string', { key: 'agent_name', size: 128, required: false }],
    ['double', { key: 'amount_sar', required: false, min: 0, max: 9999999 }],
    ['double', { key: 'rate_sar_aed', required: false, min: 0, max: 9999 }],
    ['double', { key: 'amount_aed', required: false, min: 0, max: 9999999 }],
    ['double', { key: 'rate_aed_inr', required: false, min: 0, max: 9999 }],
    ['double', { key: 'amount_inr', required: false, min: 0, max: 99999999 }],
    ['string', { key: 'status', size: 32, required: false, default: 'pending' }],
    ['string', { key: 'notes', size: 1024, required: false }],
];
for (const [type, body] of txAttrs) await addAttr('transactions', type, body);
console.log('    → transactions attributes added');

// ─────────────────────────────────────────────────────────────────────────────
// 3. AGENTS collection
// ─────────────────────────────────────────────────────────────────────────────
await createCollection('agents', 'Agents');

const agentAttrs = [
    ['string', { key: 'name', size: 128, required: true }],
    ['string', { key: 'phone', size: 32, required: false }],
    ['string', { key: 'location', size: 128, required: false }],
    ['string', { key: 'notes', size: 512, required: false }],
];
for (const [type, body] of agentAttrs) await addAttr('agents', type, body);
console.log('    → agents attributes added');

// ─────────────────────────────────────────────────────────────────────────────
// 4. EMPLOYEES collection
// ─────────────────────────────────────────────────────────────────────────────
await createCollection('employees', 'Employees');

const empAttrs = [
    ['string', { key: 'name', size: 128, required: true }],
    ['string', { key: 'email', size: 256, required: true }],
    ['string', { key: 'role', size: 32, required: false, default: 'employee' }],
    ['string', { key: 'notes', size: 512, required: false }],
];
for (const [type, body] of empAttrs) await addAttr('employees', type, body);
console.log('    → employees attributes added');

// ─────────────────────────────────────────────────────────────────────────────
// 5. EXPENSES collection
// ─────────────────────────────────────────────────────────────────────────────
await createCollection('expenses', 'Expenses');

const expAttrs = [
    ['string', { key: 'title', size: 256, required: true }],
    ['string', { key: 'category', size: 128, required: false }],
    ['double', { key: 'amount', required: false, min: 0, max: 99999999 }],
    ['string', { key: 'currency', size: 8, required: false, default: 'INR' }],
    ['string', { key: 'date', size: 32, required: false }],
    ['string', { key: 'notes', size: 1024, required: false }],
];
for (const [type, body] of expAttrs) await addAttr('expenses', type, body);
console.log('    → expenses attributes added');

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n✅  Setup complete!\n');
console.log('   DB ID          : money_erp_db');
console.log('   Collections    : transactions, agents, employees, expenses');
console.log('   Endpoint       : https://sgp.cloud.appwrite.io/v1');
console.log('\n👉  Reload http://localhost:5173 — 404 errors should be gone.\n');
