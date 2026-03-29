import { CURRENCY_COLORS } from '../../utils/filterHelpers';

const DEFAULT_CURRENCIES = ['All', 'SAR', 'AED', 'INR'];

/**
 * Currency filter with button pills or select dropdown
 * @param {string} value - Current selected currency
 * @param {Function} onChange - Callback with new currency
 * @param {string[]} currencies - Array of currency codes
 * @param {string} variant - 'buttons' or 'select'
 */
export default function CurrencyFilter({
  value,
  onChange,
  currencies = DEFAULT_CURRENCIES,
  variant = 'buttons'
}) {
  if (variant === 'select') {
    return (
      <select
        className="form-select"
        style={{ maxWidth: 140, fontSize: 13, padding: '6px 10px', height: 36 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {currencies.map((c) => (
          <option key={c} value={c}>
            {c === 'All' ? 'All Currencies' : `${c} (${getCurrencySymbol(c)})`}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div
      className="currency-filter"
      style={{
        display: 'flex',
        gap: 4,
        background: 'rgba(255, 255, 255, 0.03)',
        padding: 4,
        borderRadius: 8
      }}
    >
      {currencies.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="currency-btn"
          data-currency={c}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: value === c ? 700 : 500,
            borderRadius: 6,
            border: 'none',
            color: '#fff',
            background: value === c ? CURRENCY_COLORS[c] : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.2s',
            minWidth: 40
          }}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function getCurrencySymbol(code) {
  const symbols = { SAR: 'ر.س', AED: 'د.إ', INR: '₹', All: '' };
  return symbols[code] || code;
}

export { CURRENCY_COLORS };
