CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  tx_id TEXT,
  creator_id TEXT,
  creator_name TEXT,
  status TEXT,
  client_name TEXT,
  inr_requested REAL,
  collected_currency TEXT,
  collected_amount REAL,
  collection_rate REAL,
  sar_to_aed_rate REAL,
  actual_aed REAL,
  aed_to_inr_rate REAL,
  actual_inr_distributed REAL,
  profit_aed REAL,
  notes TEXT,
  collection_agent_id TEXT,
  collection_agent_name TEXT,
  conversion_agent_id TEXT,
  conversion_agent_name TEXT,
  distributor_id TEXT,
  distributor_name TEXT,
  profit_inr REAL,
  edit_pending_approval INTEGER DEFAULT 0,
  is_petty_cash INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  name TEXT,
  phone TEXT,
  location TEXT,
  type TEXT,
  currency TEXT,
  notes TEXT,
  inr_balance REAL,
  sar_balance REAL,
  aed_balance REAL
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  name TEXT,
  email TEXT,
  role TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  title TEXT,
  category TEXT,
  amount REAL,
  currency TEXT,
  date TEXT,
  notes TEXT,
  type TEXT,
  distributor_id TEXT,
  distributor_name TEXT
);

CREATE TABLE IF NOT EXISTS credits (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  from_person TEXT,
  reason TEXT,
  amount_sar REAL,
  date TEXT,
  admin_approved INTEGER
);

CREATE TABLE IF NOT EXISTS aed_conversions (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  sar_amount REAL,
  aed_amount REAL,
  profit_inr REAL,
  conversion_agent_id TEXT,
  conversion_agent_name TEXT,
  date TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  createdAt TEXT,
  updatedAt TEXT,
  min_sar_rate REAL,
  min_aed_rate REAL
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  agent_name TEXT,
  agent_type TEXT, -- 'collection', 'distributor', 'conversion_sar', 'conversion_aed'
  amount REAL,
  currency TEXT,
  type TEXT, -- 'debit' or 'credit'
  reference_type TEXT, -- 'transaction', 'expense', 'aed_conversion', 'deposit', 'payment', 'transfer'
  reference_id TEXT,
  description TEXT,
  running_balance REAL,
  createdAt TEXT,
  updatedAt TEXT
);
