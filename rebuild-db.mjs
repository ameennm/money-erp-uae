import { Client, Databases } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const db = new Databases(client);

const DB_ID = 'money_erp_db';

const COLLECTIONS = {
    transactions: 'Transactions',
    agents: 'Agents',
    employees: 'Employees',
    expenses: 'Expenses',
    conversion_agents: 'Conversion Agents',
    credits: 'Credits',
    aed_conversions: 'AED Conversions'
};

const PERMS = ['read("users")', 'create("users")', 'update("users")', 'delete("users")'];

const SCHEMA = {
    transactions: [
        ['string', 'tx_id', false, 64],
        ['string', 'client_name', true, 128],
        ['string', 'agent_id', false, 64],
        ['string', 'agent_name', false, 128],
        ['float', 'amount_sar', false],
        ['float', 'rate_sar_aed', false],
        ['float', 'amount_aed', false],
        ['float', 'rate_aed_inr', false],
        ['float', 'amount_inr', false],
        ['float', 'amount_given_sar', false],
        ['float', 'client_inr', false],
        ['string', 'conversion_agent_id', false, 64],
        ['string', 'conversion_agent_name', false, 128],
        ['string', 'creator_id', false, 64],
        ['string', 'creator_name', false, 128],
        ['string', 'status', false, 32, 'pending'],
        ['string', 'notes', false, 1024],
        ['string', 'assigned_to', false, 64],
        ['string', 'assigned_name', false, 128],
        ['boolean', 'distributor_approved', false, null, false]
    ],
    agents: [
        ['string', 'name', true, 128],
        ['string', 'phone', false, 32],
        ['string', 'location', false, 128],
        ['string', 'notes', false, 512]
    ],
    conversion_agents: [
        ['string', 'name', true, 128],
        ['string', 'phone', false, 32],
        ['string', 'location', false, 128],
        ['string', 'notes', false, 512]
    ],
    employees: [
        ['string', 'name', true, 128],
        ['string', 'email', true, 256],
        ['string', 'role', false, 32, 'employee'],
        ['string', 'notes', false, 512]
    ],
    expenses: [
        ['string', 'title', true, 256],
        ['string', 'category', false, 128],
        ['float', 'amount', false],
        ['string', 'currency', false, 8, 'INR'],
        ['string', 'date', false, 32],
        ['string', 'notes', false, 1024]
    ],
    credits: [
        ['string', 'from_person', false, 128],
        ['string', 'reason', false, 256],
        ['float', 'amount_sar', false],
        ['string', 'date', false, 32],
        ['boolean', 'admin_approved', false, null, false]
    ],
    aed_conversions: [
        ['float', 'sar_amount', true],
        ['float', 'rate_sar_aed', true],
        ['float', 'aed_amount', true],
        ['float', 'rate_aed_inr', true],
        ['float', 'inr_expected', true],
        ['float', 'inr_received', true],
        ['float', 'profit_inr', false],
        ['string', 'conversion_agent_id', true, 64],
        ['string', 'conversion_agent_name', true, 128],
        ['string', 'date', true, 32],
        ['string', 'notes', false, 512]
    ]
};

async function createAttr(col, type, key, req, sizeOrMin, defaultVal) {
    try {
        if (type === 'string') {
            await db.createStringAttribute(DB_ID, col, key, sizeOrMin || 256, req, defaultVal);
        } else if (type === 'float') {
            // Appwrite uses createFloatAttribute
            await db.createFloatAttribute(DB_ID, col, key, req, undefined, undefined, defaultVal);
        } else if (type === 'boolean') {
            await db.createBooleanAttribute(DB_ID, col, key, req, defaultVal);
        }
        console.log(`    + Attr ${key} (${type}) added`);
    } catch (e) {
        if (e.code === 409) {
            console.log(`    = Attr ${key} already exists`);
        } else {
            console.error(`    ! Failed attr ${key}: ${e.message}`);
        }
    }
}

async function run() {
    console.log("🚀 Setting up Appwrite schema...");
    for (const [col, name] of Object.entries(COLLECTIONS)) {
        console.log(`\n📦 Collection: ${name}`);
        try {
            await db.createCollection(DB_ID, col, name, PERMS, false, true);
        } catch (e) {
            if (e.code === 409) {
                await db.updateCollection(DB_ID, col, name, PERMS, false, true);
            } else {
                console.error(`Failed to create collection ${name}: ${e.message}`);
                continue;
            }
        }

        // Sleep to let DB catch up slightly
        await new Promise(r => setTimeout(r, 500));

        const attrs = SCHEMA[col] || [];
        for (const [type, key, req, size, def] of attrs) {
            await createAttr(col, type, key, req, size, def);
            await new Promise(r => setTimeout(r, 200)); // Rate limit dodge
        }
    }

    // Create initial user
    console.log('\n✅ Database schema applied!');
}

run().catch(console.error);
