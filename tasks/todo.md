# Transaction Form Validation

- [x] Pull latest code from GitHub.
- [x] Ensure transaction submit fails if required fields (Agent, Distributor, Amount, etc.) are blank.
- [x] Add HTML5 `required` attribute to agent dropdown.
- [x] Add code-level form field validation in `TransactionsPage.jsx`.

## Review
- Modified `handleSave` in `src/pages/TransactionsPage.jsx` to validate `form.client_name`, `form.inr_requested`, `form.collection_agent_id`, `form.collection_rate`, `form.collected_amount`, and `form.distributor_id`.
- Added `required` to `Collection Agent` dropdown to catch via browser.
- Tested logic flow (programmatically via code review), returning early with user-facing toast `toast.error('Please fill all required fields')`.
