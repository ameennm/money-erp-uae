/**
 * MoneyFlow ERP — Appwrite User Setup Script
 * Run once:  node setup-users.mjs
 */

const ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
const PROJECT_ID = '6999fff50036fef7a425';
const API_KEY = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';

// ── Users to create ──────────────────────────────────────────────────────────
const USERS = [
    {
        userId: 'superadmin001',
        email: 'admin@moneytransfer.com',
        password: 'Admin@12345',
        name: 'Super Admin',
        role: 'superadmin',
    },
    {
        userId: 'collector001',
        email: 'collector@collector.moneytransfer.com',
        password: 'Collect@12345',
        name: 'Collector One',
        role: 'collector',
    },
    {
        userId: 'employee001',
        email: 'employee@moneytransfer.com',
        password: 'Employ@12345',
        name: 'Employee One',
        role: 'employee',
    },
];

// ── Helper ────────────────────────────────────────────────────────────────────
async function createUser({ userId, email, password, name, role }) {
    const res = await fetch(`${ENDPOINT}/users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Appwrite-Project': PROJECT_ID,
            'X-Appwrite-Key': API_KEY,
        },
        body: JSON.stringify({ userId, email, password, name }),
    });

    const data = await res.json();

    if (res.ok) {
        console.log(`✅  [${role.toUpperCase()}] Created: ${email}  |  Password: ${password}`);
    } else if (data?.code === 409) {
        console.log(`⚠️  [${role.toUpperCase()}] Already exists: ${email}`);
    } else {
        console.error(`❌  [${role.toUpperCase()}] Failed (${email}):`, data?.message || data);
    }
}

// ── Run ───────────────────────────────────────────────────────────────────────
console.log('\n🚀  MoneyFlow ERP — Creating Appwrite Users\n');

for (const user of USERS) {
    await createUser(user);
}

console.log('\n── Login Credentials ────────────────────────────────');
for (const u of USERS) {
    console.log(`  ${u.role.padEnd(12)} │ ${u.email.padEnd(42)} │ ${u.password}`);
}
console.log('─────────────────────────────────────────────────────\n');
console.log('👉  Open http://localhost:5173/login and sign in.\n');
