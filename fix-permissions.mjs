const E = 'https://sgp.cloud.appwrite.io/v1';
const P = '6999fff50036fef7a425';
const DB = 'money_erp_db';
const K = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';

const H = {
    'Content-Type': 'application/json',
    'X-Appwrite-Project': P,
    'X-Appwrite-Key': K,
};

// Any logged-in user can read/write — security enforced at the app level
const perms = [
    'read("users")',
    'create("users")',
    'update("users")',
    'delete("users")',
];

const fixCol = async (col, name) => {
    const r = await fetch(`${E}/databases/${DB}/collections/${col}`, {
        method: 'PUT',
        headers: H,
        body: JSON.stringify({
            name: name || col,
            permissions: perms,
            documentSecurity: false,
            enabled: true,
        }),
    });
    const d = await r.json();
    if (r.ok) {
        process.stdout.write(`FIXED  ${col}\n`);
    } else {
        process.stdout.write(`FAIL   ${col}: ${d.message}\n`);
    }
};

(async () => {
    process.stdout.write('Fixing collection permissions...\n');
    await fixCol('transactions', 'Transactions');
    await fixCol('agents', 'Agents');
    await fixCol('employees', 'Employees');
    await fixCol('expenses', 'Expenses');
    process.stdout.write('Done!\n');
})();
