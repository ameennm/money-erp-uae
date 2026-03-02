import { Client, Account, Databases, ID, Query } from 'appwrite';

// ─── Appwrite Configuration ───────────────────────────────────────────────────
export const APPWRITE_CONFIG = {
    endpoint: 'https://sgp.cloud.appwrite.io/v1',
    projectId: '6999fff50036fef7a425',
    databaseId: 'money_erp_db',
    collections: {
        transactions: 'transactions',
        agents: 'agents',
        employees: 'employees',
        expenses: 'expenses',
        credits: 'credits',
        aed_conversions: 'aed_conversions',
        settings: 'settings',
    },
};

export const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId);

client.ping().then(() => {
    console.log('%c✅ Appwrite connection verified', 'color:#00c896;font-weight:bold');
}).catch((err) => {
    console.warn('⚠️ Appwrite ping failed:', err.message);
});

export const account = new Account(client);
export const databases = new Databases(client);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authService = {
    async login(email, password) { return account.createEmailPasswordSession(email, password); },
    async logout() { return account.deleteSession('current'); },
    async getCurrentUser() { try { return await account.get(); } catch { return null; } },
    async createEmployee(email, password, name) { return account.create(ID.unique(), email, password, name); },
};

// ─── DB ───────────────────────────────────────────────────────────────────────
const DB = APPWRITE_CONFIG.databaseId;
const COL = APPWRITE_CONFIG.collections;

const SETTINGS_DOC_ID = 'global_settings';

export const dbService = {
    // Transactions
    async createTransaction(data) { return databases.createDocument(DB, COL.transactions, ID.unique(), data); },
    async listTransactions(q = []) { return databases.listDocuments(DB, COL.transactions, [Query.orderDesc('$createdAt'), Query.limit(500), ...q]); },
    async getTransaction(id) { return databases.getDocument(DB, COL.transactions, id); },
    async updateTransaction(id, data) { return databases.updateDocument(DB, COL.transactions, id, data); },
    async deleteTransaction(id) { return databases.deleteDocument(DB, COL.transactions, id); },

    // Collection Agents
    async listAgents(q = []) { return databases.listDocuments(DB, COL.agents, q); },
    async createAgent(data) { return databases.createDocument(DB, COL.agents, ID.unique(), data); },
    async updateAgent(id, data) { return databases.updateDocument(DB, COL.agents, id, data); },
    async deleteAgent(id) { return databases.deleteDocument(DB, COL.agents, id); },

    // Employees
    async listEmployees(q = []) { return databases.listDocuments(DB, COL.employees, q); },
    async createEmployee(data) { return databases.createDocument(DB, COL.employees, ID.unique(), data); },
    async updateEmployee(id, data) { return databases.updateDocument(DB, COL.employees, id, data); },
    async deleteEmployee(id) { return databases.deleteDocument(DB, COL.employees, id); },

    // Expenses
    async listExpenses(q = []) { return databases.listDocuments(DB, COL.expenses, [Query.orderDesc('$createdAt'), ...q]); },
    async createExpense(data) { return databases.createDocument(DB, COL.expenses, ID.unique(), data); },
    async deleteExpense(id) { return databases.deleteDocument(DB, COL.expenses, id); },

    // Credits
    async listCredits(q = []) { return databases.listDocuments(DB, COL.credits, [Query.orderDesc('$createdAt'), Query.limit(500), ...q]); },
    async createCredit(data) { return databases.createDocument(DB, COL.credits, ID.unique(), data); },
    async updateCredit(id, data) { return databases.updateDocument(DB, COL.credits, id, data); },
    async deleteCredit(id) { return databases.deleteDocument(DB, COL.credits, id); },

    // AED Conversions
    async listAedConversions(q = []) { return databases.listDocuments(DB, COL.aed_conversions, [Query.orderDesc('$createdAt'), Query.limit(200), ...q]); },
    async createAedConversion(data) { return databases.createDocument(DB, COL.aed_conversions, ID.unique(), data); },
    async deleteAedConversion(id) { return databases.deleteDocument(DB, COL.aed_conversions, id); },

    // Settings (single global doc)
    async getSettings() {
        try {
            return await databases.getDocument(DB, COL.settings, SETTINGS_DOC_ID);
        } catch {
            // Document doesn't exist yet — return defaults
            return { min_sar_rate: 0, min_aed_rate: 0 };
        }
    },
    async upsertSettings(data) {
        try {
            return await databases.updateDocument(DB, COL.settings, SETTINGS_DOC_ID, data);
        } catch {
            return await databases.createDocument(DB, COL.settings, SETTINGS_DOC_ID, data);
        }
    },
};

export { Query, ID };
