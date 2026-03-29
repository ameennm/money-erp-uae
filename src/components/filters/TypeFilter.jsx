/**
 * Flexible type filter with tabs, checkboxes, or select variants
 * @param {string|Array} value - Current value(s)
 * @param {Function} onChange - Callback with new value(s)
 * @param {Array} options - [{ value, label, color? }]
 * @param {string} type - 'tabs', 'checkboxes', or 'select'
 * @param {boolean} multiSelect - Allow multiple selections (for checkboxes)
 */
export default function TypeFilter({
  value,
  onChange,
  options = [],
  type = 'tabs',
  multiSelect = false
}) {
  if (type === 'select') {
    return (
      <select
        className="form-select"
        style={{ maxWidth: 160, fontSize: 13, padding: '6px 10px', height: 36 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (type === 'checkboxes') {
    const currentValues = Array.isArray(value) ? value : [];

    const handleChange = (optValue, checked) => {
      if (checked) {
        onChange([...currentValues, optValue]);
      } else {
        onChange(currentValues.filter((v) => v !== optValue));
      }
    };

    return (
      <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
        {options.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              color: currentValues.includes(opt.value)
                ? opt.color || 'var(--brand-accent)'
                : 'var(--text-muted)',
              fontWeight: currentValues.includes(opt.value) ? 600 : 400,
              transition: 'color 0.2s'
            }}
          >
            <input
              type="checkbox"
              checked={currentValues.includes(opt.value)}
              onChange={(e) => handleChange(opt.value, e.target.checked)}
              style={{
                accentColor: opt.color || 'var(--brand-accent)',
                width: 15,
                height: 15
              }}
            />
            {opt.label}
          </label>
        ))}
      </div>
    );
  }

  // Default: tabs variant
  return (
    <div
      className="type-filter-tabs"
      style={{
        display: 'flex',
        gap: 4,
        background: 'rgba(255, 255, 255, 0.03)',
        padding: 4,
        borderRadius: 12
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="type-tab"
          data-active={value === opt.value}
          style={{
            padding: '8px 20px',
            fontSize: 14,
            fontWeight: 600,
            borderRadius: 8,
            border: `1px solid ${value === opt.value ? (opt.color || 'var(--brand-accent)') : 'transparent'}`,
            background: value === opt.value ? (opt.color || 'var(--brand-accent)') : 'transparent',
            color: '#fff',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
