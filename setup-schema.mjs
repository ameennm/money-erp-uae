import { Client, Databases, ID } from 'node-appwrite';

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6999fff50036fef7a425')
    .setKey('standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd');

const databases = new Databases(client);
const DB_ID = 'money_erp_db';

// Helper: add attribute safely (skip if already exists)
async function addFloatAttr(collectionId, key, required = false, defaultValue = null) {
    try {
        await databases.createFloatAttribute(DB_ID, collectionId, key, required, defaultValue, null, null);
        console.log(`  ✅ Added float: ${key}`);
    } catch (e) {
        if (e.message?.includes('already exists') || e.code === 409) {
            console.log(`  ⏭️  Already exists: ${key}`);
        } else {
            console.error(`  ❌ Failed ${key}: ${e.message}`);
        }
    }
}

async function setupSchema() {
    console.log('\n🔧 Setting up Appwrite schema...\n');

    // ── 1. agents: add sar_balance and aed_balance ─────────────────────────
    console.log('📦 agents collection:');
    await addFloatAttr('agents', 'sar_balance', false, 0);
    await addFloatAttr('agents', 'aed_balance', false, 0);

    // ── 2. transactions: add profit_inr ────────────────────────────────────
    console.log('\n📦 transactions collection:');
    await addFloatAttr('transactions', 'profit_inr', false, null);

    // ── 3. Create settings collection ─────────────────────────────────────
    console.log('\n📦 settings collection:');
    try {
        await databases.createCollection(
            DB_ID,
            'settings',
            'settings',
            [
                'read("any")',
                'create("users")',
                'update("users")',
                'delete("users")',
            ]
        );
        console.log('  ✅ Created settings collection');
    } catch (e) {
        if (e.message?.includes('already exists') || e.code === 409) {
            console.log('  ⏭️  settings collection already exists');
        } else {
            console.error('  ❌ Failed to create collection:', e.message);
        }
    }

    // Wait a moment for collection to be ready
    await new Promise(r => setTimeout(r, 1500));

    await addFloatAttr('settings', 'min_sar_rate', false, 0);
    await addFloatAttr('settings', 'min_aed_rate', false, 0);

    // ── 4. Create initial settings document ───────────────────────────────
    console.log('\n📄 Creating initial settings document...');
    try {
        await databases.createDocument(DB_ID, 'settings', 'global_settings', {
            min_sar_rate: 0,
            min_aed_rate: 0,
        });
        console.log('  ✅ Created global_settings document (rates set to 0 — update in Settings page)');
    } catch (e) {
        if (e.message?.includes('already exists') || e.code === 409) {
            console.log('  ⏭️  global_settings document already exists');
        } else {
            console.error('  ❌ Failed:', e.message);
        }
    }

    console.log('\n✨ Schema setup complete!\n');
    console.log('📌 Next step: Go to /settings in the app and set your minimum rates.');
}

setupSchema();
