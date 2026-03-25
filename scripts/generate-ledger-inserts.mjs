import fs from 'fs';
import crypto from 'crypto';

const data = JSON.parse(fs.readFileSync('/tmp/db_data.json', 'utf8'));

// Wrangler --json output with multiple queries is an array of results
const txs = data[0].results;
const exps = data[1].results;
const bulks = data[2].results;
const agents = data[3].results;
const credits = data[4]?.results || [];

const agentsMap = {};
const agentsByName = {};
agents.forEach(a => {
    agentsMap[a.id] = a;
    agentsByName[a.name.toUpperCase()] = a;
});

const findAgent = (id, name, title = '', notes = '') => {
    if (id && agentsMap[id]) return agentsMap[id];
    if (name && agentsByName[name.toUpperCase()]) return agentsByName[name.toUpperCase()];
    
    // Search in title or notes
    for (const aName in agentsByName) {
        if (title.toUpperCase().includes(aName) || notes.toUpperCase().includes(aName)) {
            return agentsByName[aName];
        }
    }
    return null;
};

const ledgerEntries = [];

// 1. Process Transactions
txs.forEach(tx => {
    const createdAt = tx.createdAt || tx.date || new Date().toISOString();
    
    // Agent Collection
    if (tx.collection_agent_id) {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: tx.collection_agent_id,
            agent_name: tx.collection_agent_name,
            amount: Number(tx.collected_amount || 0),
            currency: tx.collected_currency || 'SAR',
            type: 'credit',
            reference_type: 'transaction',
            reference_id: tx.id,
            description: `Collection for transaction #${tx.tx_id || tx.id.slice(0, 6)}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }

    // Distributor Distribution (AED & INR)
    if (tx.distributor_id) {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: tx.distributor_id,
            agent_name: tx.distributor_name,
            amount: Number(tx.actual_aed || 0),
            currency: 'AED',
            type: 'debit',
            reference_type: 'transaction',
            reference_id: tx.id + '_dist_aed',
            description: `Distribution (AED cost) for tx #${tx.tx_id || tx.id.slice(0, 6)}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });

        if (Number(tx.actual_inr_distributed) > 0) {
            ledgerEntries.push({
                id: crypto.randomUUID(),
                agent_id: tx.distributor_id,
                agent_name: tx.distributor_name,
                amount: Number(tx.actual_inr_distributed),
                currency: 'INR',
                type: 'debit',
                reference_type: 'transaction',
                reference_id: tx.id + '_dist_inr',
                description: `Distribution (INR sent) for tx #${tx.tx_id || tx.id.slice(0, 6)}`,
                createdAt: createdAt,
                updatedAt: createdAt
            });
        }
    }

    // Conversion Agent Receive
    if (tx.conversion_agent_id) {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: tx.conversion_agent_id,
            agent_name: tx.conversion_agent_name,
            amount: Number(tx.collected_amount || 0),
            currency: tx.collected_currency || 'SAR',
            type: 'credit',
            reference_type: 'transaction',
            reference_id: tx.id,
            description: `Individual conversion #${tx.tx_id || tx.id.slice(0, 6)}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }
});

// 2. Process Expenses
exps.forEach(exp => {
    const createdAt = exp.createdAt || exp.date || new Date().toISOString();
    const agentMatch = findAgent(exp.distributor_id || exp.agent_id, exp.distributor_name || exp.agent_name, exp.title, exp.notes);
    
    if (!agentMatch) return;

    if (exp.category === 'Agent Payment' || exp.category === 'Payment') {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: agentMatch.id,
            agent_name: agentMatch.name,
            amount: Number(exp.amount),
            currency: exp.currency || 'SAR',
            type: 'debit',
            reference_type: 'expense',
            reference_id: exp.id,
            description: `Payment: ${exp.notes || exp.title}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    } else if (exp.category === 'Distributor Deposit' || exp.category === 'Deposit') {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: agentMatch.id,
            agent_name: agentMatch.name,
            amount: Number(exp.amount),
            currency: exp.currency || 'AED',
            type: 'credit',
            reference_type: 'expense',
            reference_id: exp.id,
            description: `Deposit: ${exp.notes || exp.title}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    } else if (exp.category === 'Conversion Deposit') {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: agentMatch.id,
            agent_name: agentMatch.name,
            amount: Number(exp.amount),
            currency: exp.currency || 'SAR',
            type: 'credit',
            reference_type: 'expense',
            reference_id: exp.id,
            description: `Conversion Deposit: ${exp.notes || exp.title}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    } else if (exp.category === 'Conversion Receipt') {
        const amt = Number(exp.source_amount || exp.amount);
        const cur = exp.source_currency || (exp.notes?.includes('SAR') ? 'SAR' : 'AED');

        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: agentMatch.id,
            agent_name: agentMatch.name,
            amount: amt,
            currency: cur,
            type: 'debit',
            reference_type: 'expense',
            reference_id: exp.id,
            description: `Conversion Receipt: ${exp.notes || exp.title}`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }
});

// 3. Process Bulk Conversions
bulks.forEach(bulk => {
    const createdAt = bulk.createdAt || bulk.date || new Date().toISOString();
    if (bulk.conversion_agent_id) {
        ledgerEntries.push({
            id: crypto.randomUUID(),
            agent_id: bulk.conversion_agent_id,
            agent_name: bulk.conversion_agent_name,
            amount: Number(bulk.sar_amount || bulk.aed_amount),
            currency: bulk.sar_amount ? 'SAR' : 'AED',
            type: 'credit',
            reference_type: 'aed_conversion',
            reference_id: bulk.id,
            description: `Bulk conversion sync`,
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }
});

// 4. Process Credits
credits.forEach(credit => {
    const createdAt = credit.createdAt || credit.date || new Date().toISOString();
    const agentMatch = findAgent(null, credit.from_person, '', credit.reason);
    
    if (!agentMatch) return;

    ledgerEntries.push({
        id: crypto.randomUUID(),
        agent_id: agentMatch.id,
        agent_name: agentMatch.name,
        amount: Number(credit.amount_sar),
        currency: 'SAR',
        type: 'credit',
        reference_type: 'credit',
        reference_id: credit.id,
        description: `Credit Deposit: ${credit.reason}`,
        createdAt: createdAt,
        updatedAt: createdAt
    });
});

// 5. Group by agent
const grouped = {};
ledgerEntries.forEach(e => {
    if (!grouped[e.agent_id]) grouped[e.agent_id] = [];
    grouped[e.agent_id].push(e);
});

// 6. Add Opening Balance Adjustments
Object.keys(agentsMap).forEach(agentId => {
    const agent = agentsMap[agentId];
    const agentEntries = grouped[agentId] || [];
    
    const currentSarSum = agentEntries.filter(e => e.currency === 'SAR').reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : -e.amount), 0);
    const currentAedSum = agentEntries.filter(e => e.currency === 'AED').reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : -e.amount), 0);
    const currentInrSum = agentEntries.filter(e => e.currency === 'INR').reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : -e.amount), 0);
    
    const diffSar = (agent.sar_balance || 0) - currentSarSum;
    const diffAed = (agent.aed_balance || 0) - currentAedSum;
    const diffInr = (agent.inr_balance || 0) - currentInrSum;

    if (Math.abs(diffSar) > 0.01) {
        const createdAt = agent.createdAt || new Date(0).toISOString();
        if (!grouped[agentId]) grouped[agentId] = [];
        grouped[agentId].unshift({
            id: crypto.randomUUID(),
            agent_id: agentId,
            agent_name: agent.name,
            amount: Math.round(Math.abs(diffSar) * 100) / 100,
            currency: 'SAR',
            type: diffSar > 0 ? 'credit' : 'debit',
            reference_type: 'adjustment',
            reference_id: 'opening-balance-sar',
            description: 'Opening Balance Adjustment (Pre-Ledger)',
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }
    
    if (Math.abs(diffAed) > 0.01) {
        const createdAt = agent.createdAt || new Date(0).toISOString();
        if (!grouped[agentId]) grouped[agentId] = [];
        grouped[agentId].unshift({
            id: crypto.randomUUID(),
            agent_id: agentId,
            agent_name: agent.name,
            amount: Math.round(Math.abs(diffAed) * 100) / 100,
            currency: 'AED',
            type: diffAed > 0 ? 'credit' : 'debit',
            reference_type: 'adjustment',
            reference_id: 'opening-balance-aed',
            description: 'Opening Balance Adjustment (Pre-Ledger)',
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }

    if (Math.abs(diffInr) > 0.01) {
        const createdAt = agent.createdAt || new Date(0).toISOString();
        if (!grouped[agentId]) grouped[agentId] = [];
        grouped[agentId].unshift({
            id: crypto.randomUUID(),
            agent_id: agentId,
            agent_name: agent.name,
            amount: Math.round(Math.abs(diffInr) * 100) / 100,
            currency: 'INR',
            type: diffInr > 0 ? 'credit' : 'debit',
            reference_type: 'adjustment',
            reference_id: 'opening-balance-inr',
            description: 'Opening Balance Adjustment (Pre-Ledger)',
            createdAt: createdAt,
            updatedAt: createdAt
        });
    }
});

// 7. Generate SQL
let sql = 'DELETE FROM ledger_entries;\n';

Object.keys(grouped).forEach(agentId => {
    grouped[agentId].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    
    let running_balance = 0;
    grouped[agentId].forEach(e => {
        if (e.type === 'credit') running_balance += e.amount;
        else running_balance -= e.amount;
        e.running_balance = Math.round(running_balance * 100) / 100;
        
        sql += `INSERT INTO ledger_entries (id, agent_id, agent_name, amount, currency, type, reference_type, reference_id, description, running_balance, createdAt, updatedAt) VALUES ('${e.id}', '${e.agent_id}', '${e.agent_name.replace(/'/g, "''")}', ${e.amount}, '${e.currency}', '${e.type}', '${e.reference_type}', '${e.reference_id}', '${e.description.replace(/'/g, "''")}', ${e.running_balance}, '${e.createdAt}', '${e.updatedAt}');\n`;
    });
});

// 8. Generate Agent Balance Updates
Object.keys(grouped).forEach(agentId => {
    const agentEntries = grouped[agentId];
    if (agentEntries.length === 0) return;
    
    const sar_balance = agentEntries.filter(e => e.currency === 'SAR').reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : -e.amount), 0);
    const aed_balance = agentEntries.filter(e => e.currency === 'AED').reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : -e.amount), 0);
    const inr_balance = agentEntries.filter(e => e.currency === 'INR').reduce((sum, e) => sum + (e.type === 'credit' ? e.amount : -e.amount), 0);
    
    sql += `UPDATE agents SET sar_balance = ${Math.round(sar_balance * 100) / 100}, aed_balance = ${Math.round(aed_balance * 100) / 100}, inr_balance = ${Math.round(inr_balance * 100) / 100} WHERE id = '${agentId}';\n`;
});

fs.writeFileSync('/tmp/reconcile_ledger.sql', sql);
console.log('SQL generated to /tmp/reconcile_ledger.sql');
