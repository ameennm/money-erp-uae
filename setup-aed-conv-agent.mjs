const E = 'https://sgp.cloud.appwrite.io/v1', P = '6999fff50036fef7a425', DB = 'money_erp_db';
const K = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';
const H = { 'Content-Type': 'application/json', 'X-Appwrite-Project': P, 'X-Appwrite-Key': K };

const api = async (m, p, b) => {
    const r = await fetch(E + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
    return { s: r.status, d: await r.json() };
};

const addStr = async (col, key, size = 256) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections/${col}/attributes/string`, { key, size, required: false });
    console.log(s === 202 ? 'str ' + key : s === 409 ? 'skip ' + key : 'FAIL ' + key + ': ' + d.message);
};

(async () => {
    await addStr('aed_conversions', 'conversion_agent_id', 64);
    await addStr('aed_conversions', 'conversion_agent_name', 128);
    console.log('Done');
})();
