-- D1 Database Wipe Script
-- This script clears operational data and resets balances.

DELETE FROM transactions;
DELETE FROM ledger_entries;
DELETE FROM expenses;
DELETE FROM aed_conversions;
DELETE FROM credits;

-- Reset balances for all agents and distributors
UPDATE agents SET inr_balance = 0, sar_balance = 0, aed_balance = 0;

-- Optional: Reset settings
UPDATE settings SET min_sar_rate = 0, min_aed_rate = 0 WHERE id = 'global_settings';

-- Note: We keep the 'employees' and 'agents' list so you don't have to re-add them.
-- If you want to delete agents entirely, uncomment the next line:
-- DELETE FROM agents;
