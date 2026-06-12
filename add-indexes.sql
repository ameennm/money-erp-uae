-- ========================================================
-- Database Indexes for money-erp CRM
-- Run: npx wrangler d1 execute money-erp-db --file=add-indexes.sql
-- ========================================================

-- Transactions
CREATE INDEX IF NOT EXISTS idx_tx_createdAt ON transactions(createdAt);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_collection_agent ON transactions(collection_agent_id);
CREATE INDEX IF NOT EXISTS idx_tx_distributor ON transactions(distributor_id);
CREATE INDEX IF NOT EXISTS idx_tx_tx_id ON transactions(tx_id);
CREATE INDEX IF NOT EXISTS idx_tx_collected_currency ON transactions(collected_currency);

-- Agents
CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
CREATE INDEX IF NOT EXISTS idx_agents_phone ON agents(phone);

-- Expenses
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
CREATE INDEX IF NOT EXISTS idx_expenses_currency ON expenses(currency);
CREATE INDEX IF NOT EXISTS idx_expenses_createdAt ON expenses(createdAt);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- Employees
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

-- Credits
CREATE INDEX IF NOT EXISTS idx_credits_createdAt ON credits(createdAt);

-- AED Conversions
CREATE INDEX IF NOT EXISTS idx_aed_conv_createdAt ON aed_conversions(createdAt);

-- Ledger Entries
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_agent ON ledger_entries(agent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_agent_reference ON ledger_entries(agent_id, reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_ledger_createdAt ON ledger_entries(createdAt);

-- Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    createdAt TEXT,
    updatedAt TEXT,
    actor_id TEXT,
    actor_name TEXT,
    actor_email TEXT,
    actor_role TEXT,
    action TEXT,
    entity_type TEXT,
    entity_id TEXT,
    entity_label TEXT,
    details TEXT
);
CREATE INDEX IF NOT EXISTS idx_activity_createdAt ON activity_logs(createdAt);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
