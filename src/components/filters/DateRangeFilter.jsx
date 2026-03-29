import { DATE_RANGES } from '../../utils/filterHelpers';

/**
 * Date range selector with preset buttons and custom date inputs
 * @param {Object} value - { range: string, customFrom: string, customTo: string }
 * @param {Function} onChange - Callback with updated value object
 * @param {string[]} ranges - Array of range options
 */
export default function DateRangeFilter({
  value,
  onChange,
  ranges = DATE_RANGES
}) {
  const { range = 'All Time', customFrom = '', customTo = '' } = value || {};

  const handleRangeChange = (newRange) => {
    onChange({
      range: newRange,
      customFrom: newRange === 'Custom' ? customFrom : '',
      customTo: newRange === 'Custom' ? customTo : ''
    });
  };

  const handleCustomFromChange = (e) => {
    onChange({ range, customFrom: e.target.value, customTo });
  };

  const handleCustomToChange = (e) => {
    onChange({ range, customFrom, customTo: e.target.value });
  };

  return (
    <div
      className="date-range-filter"
      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
    >
      {ranges.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => handleRangeChange(r)}
          className={`date-range-btn ${range === r ? 'active' : ''}`}
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${range === r ? 'var(--brand-accent)' : 'var(--border-color)'}`,
            background: range === r ? 'var(--brand-accent)' : 'var(--bg-card)',
            color: range === r ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          {r}
        </button>
      ))}

      {range === 'Custom' && (
        <>
          <input
            type="date"
            className="form-input"
            style={{ maxWidth: 148, padding: '6px 10px', fontSize: 13 }}
            value={customFrom}
            onChange={handleCustomFromChange}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>to</span>
          <input
            type="date"
            className="form-input"
            style={{ maxWidth: 148, padding: '6px 10px', fontSize: 13 }}
            value={customTo}
            onChange={handleCustomToChange}
          />
        </>
      )}
    </div>
  );
}

// Re-export for convenience
export { DATE_RANGES };
