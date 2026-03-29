import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';

/**
 * Reusable search input with icon, clear button, and debounced onChange
 * @param {string} value - Current value
 * @param {Function} onChange - Callback with debounced value
 * @param {string} placeholder - Placeholder text
 * @param {number} debounceMs - Debounce delay in ms
 * @param {string} className - Additional CSS class
 * @param {Object} style - Additional inline styles
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  debounceMs = 300,
  className = '',
  style = {}
}) {
  const [localValue, setLocalValue] = useState(value);
  const debouncedValue = useDebounce(localValue, debounceMs);

  // Sync with external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Notify parent of debounced value changes
  useEffect(() => {
    onChange(debouncedValue);
  }, [debouncedValue, onChange]);

  const handleClear = () => {
    setLocalValue('');
    onChange('');
  };

  return (
    <div
      className={`search-input-wrapper ${className}`}
      style={{ position: 'relative', flex: '1', minWidth: 200, maxWidth: 400, ...style }}
    >
      <Search
        size={16}
        className="search-icon"
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-muted)',
          pointerEvents: 'none'
        }}
      />
      <input
        type="text"
        className="form-input"
        placeholder={placeholder}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        style={{ paddingLeft: 38, paddingRight: localValue ? 38 : 14, width: '100%' }}
      />
      {localValue && (
        <button
          type="button"
          onClick={handleClear}
          className="search-clear-btn"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
