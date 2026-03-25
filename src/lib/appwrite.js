// ─── Cloudflare Workers API Wrapper ───────────────────────────────────────────
const API_BASE = '/api';

const fetchApi = async (path, options = {}) => {
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `API Error: ${res.statusText}`);
    }
    return res.json();
};

export const Query = {
    equal: (key, val) => ({ type: 'equal', key, val }),
    orderDesc: (key) => ({ type: 'orderDesc', key }),
    orderAsc: (key) => ({ type: 'orderAsc', key }),
    limit: (val) => ({ type: 'limit', val }),
    or: (subQueries) => ({ type: 'or', subQueries }),
};

export const ID = {
    unique: () => crypto.randomUUID()
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authService = {
    async login(email, password) {
        const data = await fetchApi('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        return data.user;
    },
    async logout() {
        localStorage.removeItem('currentUser');
    },
    async getCurrentUser() {
        try {
            const userStr = localStorage.getItem('currentUser');
            if (userStr) return JSON.parse(userStr);
            return null;
        } catch {
            return null;
        }
    },
    async createEmployee(email, password, name) {
        // Technically mapped to dbService.createEmployee
        const res = await dbService.createEmployee({ email, password, name, role: 'collector', notes: '' });
        return res;
    },
};

// ─── DB ───────────────────────────────────────────────────────────────────────
const matchesQuery = (item, q) => {
    if (q.type === 'equal') return item[q.key] === q.val;
    if (q.type === 'or') return q.subQueries.some(sub => matchesQuery(item, sub));
    return true;
};

const applyQueries = (data, queries = []) => {
    let filtered = [...data];
    for (const q of queries) {
        if (q.type === 'equal') {
            filtered = filtered.filter(item => item[q.key] === q.val);
        } else if (q.type === 'or') {
            filtered = filtered.filter(item => q.subQueries.some(sub => matchesQuery(item, sub)));
        } else if (q.type === 'orderDesc') {
            filtered.sort((a, b) => new Date(b[q.key] || 0) - new Date(a[q.key] || 0));
        } else if (q.type === 'orderAsc') {
            filtered.sort((a, b) => new Date(a[q.key] || 0) - new Date(b[q.key] || 0));
        } else if (q.type === 'limit') {
            filtered = filtered.slice(0, q.val);
        }
    }
    return { documents: filtered, total: filtered.length };
};

export const dbService = {
    // Transactions
    async createTransaction(data) { return fetchApi('/transactions', { method: 'POST', body: JSON.stringify(data) }); },
    async listTransactions(q = []) {
        const data = await fetchApi('/transactions');
        return applyQueries(data, q);
    },
    async getTransaction(id) { return fetchApi(`/transactions/${id}`); },
    async updateTransaction(id, data) { return fetchApi(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteTransaction(id) { return fetchApi(`/transactions/${id}`, { method: 'DELETE' }); },

    // Collection Agents
    async listAgents(q = []) {
        const data = await fetchApi('/agents');
        return applyQueries(data, q);
    },
    async createAgent(data) { return fetchApi('/agents', { method: 'POST', body: JSON.stringify(data) }); },
    async updateAgent(id, data) { return fetchApi(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteAgent(id) { return fetchApi(`/agents/${id}`, { method: 'DELETE' }); },

    // Employees
    async listEmployees(q = []) {
        const data = await fetchApi('/employees');
        return applyQueries(data, q);
    },
    async createEmployee(data) { return fetchApi('/employees', { method: 'POST', body: JSON.stringify(data) }); },
    async updateEmployee(id, data) { return fetchApi(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteEmployee(id) { return fetchApi(`/employees/${id}`, { method: 'DELETE' }); },

    // Expenses
    async listExpenses(q = []) {
        const data = await fetchApi('/expenses');
        return applyQueries(data, q);
    },
    async createExpense(data) { return fetchApi('/expenses', { method: 'POST', body: JSON.stringify(data) }); },
    async updateExpense(id, data) { return fetchApi(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteExpense(id) { return fetchApi(`/expenses/${id}`, { method: 'DELETE' }); },

    // Credits
    async listCredits(q = []) {
        const data = await fetchApi('/credits');
        return applyQueries(data, q);
    },
    async createCredit(data) { return fetchApi('/credits', { method: 'POST', body: JSON.stringify(data) }); },
    async updateCredit(id, data) { return fetchApi(`/credits/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteCredit(id) { return fetchApi(`/credits/${id}`, { method: 'DELETE' }); },

    // AED Conversions
    async listAedConversions(q = []) {
        const data = await fetchApi('/aed_conversions');
        return applyQueries(data, q);
    },
    async createAedConversion(data) { return fetchApi('/aed_conversions', { method: 'POST', body: JSON.stringify(data) }); },
    async deleteAedConversion(id) { return fetchApi(`/aed_conversions/${id}`, { method: 'DELETE' }); },

    // Settings (single global doc)
    async getSettings() {
        try {
            return await fetchApi('/settings');
        } catch {
            return { min_sar_rate: 0, min_aed_rate: 0 };
        }
    },
    async upsertSettings(data) {
        return fetchApi('/settings', { method: 'PUT', body: JSON.stringify(data) });
    },

    // Ledger Entries
    async listLedgerEntries(q = []) {
        const data = await fetchApi('/ledger_entries');
        return applyQueries(data, q);
    },
    async createLedgerEntry(data) { return fetchApi('/ledger_entries', { method: 'POST', body: JSON.stringify(data) }); },
    async updateLedgerEntry(id, data) { return fetchApi(`/ledger_entries/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteLedgerEntry(id) { return fetchApi(`/ledger_entries/${id}`, { method: 'DELETE' }); },
};
