export const AGENT_TYPES = {
  COLLECTION: 'collection',
  DISTRIBUTOR: 'distributor',
  CONVERSION_SAR: 'conversion_sar',
  CONVERSION_AED: 'conversion_aed',
  CONVERSION: 'conversion'
};

export const AGENT_TYPE_LABELS = {
  [AGENT_TYPES.COLLECTION]: 'Collector',
  [AGENT_TYPES.DISTRIBUTOR]: 'Distributor',
  [AGENT_TYPES.CONVERSION_SAR]: 'SAR Converter',
  [AGENT_TYPES.CONVERSION_AED]: 'AED Converter',
  [AGENT_TYPES.CONVERSION]: 'Conversion'
};

export const AGENT_TYPE_COLORS = {
  [AGENT_TYPES.COLLECTION]: '#00c896',
  [AGENT_TYPES.DISTRIBUTOR]: '#f5a623',
  [AGENT_TYPES.CONVERSION_SAR]: '#4a9eff',
  [AGENT_TYPES.CONVERSION_AED]: '#a78bfa',
  [AGENT_TYPES.CONVERSION]: '#fb923c'
};

export const EXPENSE_CATEGORIES = [
  'Office Rent',
  'Salaries',
  'Commission',
  'Transfer Fees',
  'Bank Charges',
  'Utilities',
  'Marketing',
  'Miscellaneous'
];

export const INCOME_CATEGORIES = [
  'Service Fee',
  'Markup',
  'Capital Injection',
  'Agent Payment',
  'Other Income'
];

export const TRANSACTION_STATUSES = [
  { value: 'pending_collection', label: 'Pending Collection', badge: 'badge-pending' },
  { value: 'pending_conversion', label: 'Pending Conversion (SAR→AED)', badge: 'badge-inprogress' },
  { value: 'pending_distribution', label: 'Pending Distribution (AED→INR)', badge: 'badge-collector' },
  { value: 'completed', label: 'Completed', badge: 'badge-completed' },
];

export const CURRENCIES = {
  SAR: { symbol: 'ر.س', code: 'SAR', color: '#4a9eff' },
  AED: { symbol: 'د.إ', code: 'AED', color: '#f5a623' },
  INR: { symbol: '₹', code: 'INR', color: '#a78bfa' }
};

export const SEARCH_DEBOUNCE_MS = 300;

export const EXPENSE_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense'
};

export const CREDIT_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CLEARED: 'cleared'
};
