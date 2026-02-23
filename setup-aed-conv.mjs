const E = 'https://sgp.cloud.appwrite.io/v1', P = '6999fff50036fef7a425', DB = 'money_erp_db';
const K = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';
const H = { 'Content-Type': 'application/json', 'X-Appwrite-Project': P, 'X-Appwrite-Key': K };
const perms = ['read("users")', 'create("users")', 'update("users")', 'delete("users")'];

const api = async (m, p, b) => {
    const r = await fetch(E + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, d: await r.json() };
};

const mkCol = async (id, name) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections`, { collectionId: id, name, permissions: perms, documentSecurity: false });
    if (s === 201) console.log('CREATED', id);
    else if (s === 409) console.log('EXISTS', id);
    else console.log('FAIL', id, d.message);
};

const addFloat = async (col, key) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections/${col}/attributes/float`, { key, required: false });
    console.log(s === 202 ? 'float ' + key : s === 409 ? 'skip ' + key : 'FAIL ' + key + ': ' + d.message);
};

const addStr = async (col, key, size = 256) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections/${col}/attributes/string`, { key, size, required: false });
    console.log(s === 202 ? 'str ' + key : s === 409 ? 'skip ' + key : 'FAIL ' + key + ': ' + d.message);
};

const fixPerms = async (col) => {
    const { s, d } = await api('PUT', `/databases/${DB}/collections/${col}`, { name: col, permissions: perms, documentSecurity: false, enabled: true });
    console.log(s === 200 ? 'perms OK ' + col : 'perms FAIL ' + col + ': ' + d.message);
};

(async () => {
    await mkCol('aed_conversions', 'AED Conversions');
    await addFloat('aed_conversions', 'sar_amount');
    await addFloat('aed_conversions', 'sar_rate');
    await addFloat('aed_conversions', 'aed_amount');
    await addFloat('aed_conversions', 'aed_inr_rate');
    await addFloat('aed_conversions', 'inr_received');
    await addFloat('aed_conversions', 'inr_promised');
    await addFloat('aed_conversions', 'profit_inr');
    await addStr('aed_conversions', 'date', 32);
    await addStr('aed_conversions', 'notes', 512);
    await fixPerms('aed_conversions');
    console.log('Done');
})();
