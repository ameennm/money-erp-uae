# Transaction Form Validation

- [x] Pull latest code from GitHub.
- [x] Ensure transaction submit fails if required fields (Agent, Distributor, Amount, etc.) are blank.
- [x] Add HTML5 `required` attribute to agent dropdown.
- [x] Add code-level form field validation in `TransactionsPage.jsx`.

## Review
- Modified `handleSave` in `src/pages/TransactionsPage.jsx` to validate `form.client_name`, `form.inr_requested`, `form.collection_agent_id`, `form.collection_rate`, `form.collected_amount`, and `form.distributor_id`.
- Added `required` to `Collection Agent` dropdown to catch via browser.
- Tested logic flow (programmatically via code review), returning early with user-facing toast `toast.error('Please fill all required fields')`.

---

# Profile Transaction History Filters (Ledger Modal)

- [x] Analyze `LedgerModal.jsx` and the existing filter components in `src/components/filters.jsx`.
- [x] Import `SearchInput`, `DateRangeFilter`, `FilterBar`, `createSearchMatcher`, and `applyDateRange`.
- [x] Replace custom inline currency buttons with the standard `FilterBar` to unify UI.
- [x] Add state variables for `searchTerm` and `dateRange` in `LedgerModal.jsx`.
- [x] Implement useMemo for executing combined filter matches (`search`, `dateRange`, `currencyFilter`) on profile ledger entries.
- [x] Ensure transaction sum calculations dynamically reflect the active filters.

---

# Balance & Advance System (Pocket Money)

- [x] Update `DistributorsPage.jsx` with dual buttons (Pay/Receive) and status labels.
- [x] Update `AgentsPage.jsx` with Money Ops (Receive/Payment) and status labels.
- [x] Update `ConversionAgentsPage.jsx` with source-specific Owed/Pocket logic.
- [x] Hide agent/distributor dropdowns in `ExpensesPage.jsx` to prevent manual balance errors.
- [x] Create and run `scripts/test-e2e-balances.mjs` to verify all logic.
- [x] Final UI walkthrough.

## Review
- Implemented a "Money Ops" system across all agent management pages.
- Replaced "Deposit" buttons with dual-action buttons (Debit/Credit logic).
- Added smart labels: "They owe us" vs "We owe them" (Pocket Money) based on balance sign.
- Used `ledgerService.recordEntry` to keep business logic centralized and rounding-safe.
