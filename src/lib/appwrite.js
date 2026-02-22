import { Client, Account, Databases, ID, Query } from 'appwrite';

// ─── Appwrite Configuration ───────────────────────────────────────────────────
export const APPWRITE_CONFIG = {
    endpoint: 'https://sgp.cloud.appwrite.io/v1',
    projectId: '6999fff50036fef7a425',
    databaseId: 'money_erp_db',           // Change to your Appwrite Database ID
    collections: {
        transactions: 'transactions',
        agents: 'agents',
        employees: 'employees',
        expenses: 'expenses',
    },
};

// ─── Client ───────────────────────────────────────────────────────────────────
export const client = new Client()
    .setEndpoint(APPWRITE_CONFIG.endpoint)
    .setProject(APPWRITE_CONFIG.projectId);

// Ping the Appwrite backend to verify the connection on app load
client.ping().then(() => {
    console.log('%c✅ Appwrite connection verified', 'color:#00c896;font-weight:bold');
}).catch((err) => {
    console.warn('⚠️ Appwrite ping failed:', err.message);
});

export const account = new Account(client);
export const databases = new Databases(client);

// ─── Auth Helpers ─────────────────────────────────────────────────────────────
export const authService = {
    async login(email, password) {
        return account.createEmailPasswordSession(email, password);
    },
    async logout() {
        return account.deleteSession('current');
    },
    async getCurrentUser() {
        try {
            return await account.get();
        } catch {
            return null;
        }
    },
    async createEmployee(email, password, name) {
        return account.create(ID.unique(), email, password, name);
    },
};

// ─── Database Helpers ─────────────────────────────────────────────────────────
const DB = APPWRITE_CONFIG.databaseId;
const COL = APPWRITE_CONFIG.collections;

export const dbService = {
    // Transactions
    async createTransaction(data) {
        return databases.createDocument(DB, COL.transactions, ID.unique(), data);
    },
    async listTransactions(queries = []) {
        return databases.listDocuments(DB, COL.transactions, [
            Query.orderDesc('$createdAt'),
            Query.limit(200),
            ...queries,
        ]);
    },
    async getTransaction(id) {
        return databases.getDocument(DB, COL.transactions, id);
    },
    async updateTransaction(id, data) {
        return databases.updateDocument(DB, COL.transactions, id, data);
    },
    async deleteTransaction(id) {
        return databases.deleteDocument(DB, COL.transactions, id);
    },

    // Agents
    async listAgents(queries = []) {
        return databases.listDocuments(DB, COL.agents, queries);
    },
    async createAgent(data) {
        return databases.createDocument(DB, COL.agents, ID.unique(), data);
    },
    async updateAgent(id, data) {
        return databases.updateDocument(DB, COL.agents, id, data);
    },
    async deleteAgent(id) {
        return databases.deleteDocument(DB, COL.agents, id);
    },

    // Employees
    async listEmployees(queries = []) {
        return databases.listDocuments(DB, COL.employees, queries);
    },
    async createEmployee(data) {
        return databases.createDocument(DB, COL.employees, ID.unique(), data);
    },
    async updateEmployee(id, data) {
        return databases.updateDocument(DB, COL.employees, id, data);
    },
    async deleteEmployee(id) {
        return databases.deleteDocument(DB, COL.employees, id);
    },

    // Expenses
    async listExpenses(queries = []) {
        return databases.listDocuments(DB, COL.expenses, [
            Query.orderDesc('$createdAt'),
            ...queries,
        ]);
    },
    async createExpense(data) {
        return databases.createDocument(DB, COL.expenses, ID.unique(), data);
    },
    async deleteExpense(id) {
        return databases.deleteDocument(DB, COL.expenses, id);
    },
};

export { Query, ID };
