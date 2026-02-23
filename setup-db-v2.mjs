/**
 * MoneyFlow ERP — Extended DB Setup
 * Adds: conversion_agents collection, credits collection, client_inr field on transactions
 */

const E = 'https://sgp.cloud.appwrite.io/v1';
const P = '6999fff50036fef7a425';
const DB = 'money_erp_db';
const K = 'standard_656bd22fad34ed15a8d221411f9691d9bad8f17ec943753b7cc47fc0b4316077f3ce8f8460f5c783c5775e58957da1f48c6b0a09550386f23a1ed3efd62ab8241cd275de7872724b2552348350feed67e8584aad4a1f9638f20321af91eaa8ffed98742ab9ecc23d2559f625e9d02db2d2f5a48284b58d507f99a65beecc05fd';

const H = { 'Content-Type': 'application/json', 'X-Appwrite-Project': P, 'X-Appwrite-Key': K };
const perms = ['read("users")', 'create("users")', 'update("users")', 'delete("users")'];

const api = async (method, path, body) => {
    const r = await fetch(E + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
    return { s: r.status, d: await r.json() };
};

const mkCol = async (id, name) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections`, {
        collectionId: id, name, permissions: perms, documentSecurity: false,
    });
    if (s === 201) console.log(`✅  Collection created: ${id}`);
    else if (s === 409) console.log(`⚠️  Collection exists: ${id}`);
    else throw new Error(`${id}: ${d.message}`);
};

const addStr = async (col, key, size = 256, req = false) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections/${col}/attributes/string`, { key, size, required: req });
    if (s === 202) console.log(`   str  ${col}.${key}`);
    else if (s === 409) console.log(`   skip ${col}.${key} (exists)`);
    else console.warn(`   WARN ${col}.${key}: ${d.message}`);
};

const addFloat = async (col, key) => {
    const { s, d } = await api('POST', `/databases/${DB}/collections/${col}/attributes/float`, { key, required: false });
    if (s === 202) console.log(`   flt  ${col}.${key}`);
    else if (s === 409) console.log(`   skip ${col}.${key} (exists)`);
    else console.warn(`   WARN ${col}.${key}: ${d.message}`);
};

(async () => {
    console.log('\n🚀  MoneyFlow ERP — Extended DB Setup\n');

    // ── 1. Add client_inr to transactions ──────────────────────────────────────
    console.log('📌  Adding client_inr to transactions…');
    await addFloat('transactions', 'client_inr');
    await addStr('transactions', 'conversion_agent_id', 64);
    await addStr('transactions', 'conversion_agent_name', 128);

    // ── 2. Conversion Agents collection ───────────────────────────────────────
    console.log('\n📦  Creating conversion_agents collection…');
    await mkCol('conversion_agents', 'Conversion Agents');
    await addStr('conversion_agents', 'name', 128, true);
    await addStr('conversion_agents', 'phone', 32);
    await addStr('conversion_agents', 'notes', 512);

    // ── 3. Credits collection ─────────────────────────────────────────────────
    console.log('\n📦  Creating credits collection…');
    await mkCol('credits', 'Credits');
    await addStr('credits', 'from_person', 128, true);
    await addStr('credits', 'reason', 512);
    await addFloat('credits', 'amount_sar');
    await addStr('credits', 'date', 32);
    await addStr('credits', 'notes', 512);

    // Fix permissions on new collections
    for (const col of ['conversion_agents', 'credits']) {
        const { s, d } = await api('PUT', `/databases/${DB}/collections/${col}`, {
            name: col, permissions: perms, documentSecurity: false, enabled: true,
        });
        console.log(s === 200 ? `✅  Perms OK: ${col}` : `⚠️  Perms: ${d.message}`);
    }

    console.log('\n✅  Extended DB setup complete!\n');
})();
