import { startOfDay, startOfWeek, startOfMonth, isAfter } from 'date-fns';

export const DATE_RANGES = ['Today', 'This Week', 'This Month', 'All Time', 'Custom'];

export const CURRENCIES = ['All', 'SAR', 'AED', 'INR'];

export const CURRENCY_COLORS = {
  SAR: '#4a9eff',
  AED: '#f5a623',
  INR: '#a78bfa',
  All: 'var(--brand-accent)'
};

/**
 * Safe round to 2 decimal places
 * Avoids floating point precision issues
 * @param {number} n - Number to round
 * @returns {number} Rounded number
 */
export const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Applies date range filter to an array of objects
 * @param {Array} arr - Array to filter
 * @param {string} range - Date range ('Today', 'This Week', 'This Month', 'All Time', 'Custom')
 * @param {string} from - Custom start date (YYYY-MM-DD)
 * @param {string} to - Custom end date (YYYY-MM-DD)
 * @param {string} dateField - Field name containing the date (default: '$createdAt')
 * @returns {Array} Filtered array
 */
export const applyDateRange = (arr, range, from, to, dateField = '$createdAt') => {
  if (range === 'All Time') return arr;

  const now = new Date();
  let start;

  if (range === 'Today') {
    start = startOfDay(now);
  } else if (range === 'This Week') {
    start = startOfWeek(now, { weekStartsOn: 1 });
  } else if (range === 'This Month') {
    start = startOfMonth(now);
  } else if (range === 'Custom') {
    return arr.filter(r => {
      const d = new Date(r[dateField] || r.$createdAt);
      const f = from ? new Date(from) : null;
      const t = to ? new Date(to + 'T23:59:59') : null;
      return (!f || d >= f) && (!t || d <= t);
    });
  }

  return arr.filter(r => isAfter(new Date(r[dateField] || r.$createdAt), start));
};

/**
 * Creates a search matcher function for filtering arrays
 * @param {string[]} fields - Array of field names to search in
 * @returns {Function} Matcher function that takes an item and returns boolean
 */
export const createSearchMatcher = (fields) => {
  return (item, searchTerm) => {
    if (!searchTerm || !searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase().trim();

    return fields.some(field => {
      const value = item[field];
      if (value === null || value === undefined) return false;
      if (typeof value === 'string') return value.toLowerCase().includes(term);
      if (typeof value === 'number') return value.toString().toLowerCase().includes(term);
      return false;
    });
  };
};

/**
 * Creates a combined filter function from multiple matchers
 * @param {Function[]} matchers - Array of matcher functions
 * @returns {Function} Combined matcher
 */
export const combineMatchers = (...matchers) => {
  return (item) => matchers.every(matcher => matcher(item));
};

/**
 * Sums a numeric field from an array
 * @param {Array} arr - Array to sum
 * @param {string} field - Field name to sum
 * @returns {number} Sum of values
 */
export const sum = (arr, field) => arr.reduce((a, t) => a + (Number(t[field]) || 0), 0);

/**
 * Formats currency amount
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code
 * @returns {string} Formatted string
 */
export const formatCurrency = (amount, currency = 'AED') => {
  const symbols = { SAR: 'ر.س', AED: 'د.إ', INR: '₹', USD: '$' };
  const symbol = symbols[currency] || currency;
  return `${symbol} ${(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
