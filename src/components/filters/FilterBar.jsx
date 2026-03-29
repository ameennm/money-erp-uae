/**
 * Container component for filter controls
 * Provides consistent spacing and optional clear all functionality
 * @param {ReactNode} children - Filter components to render
 * @param {string} layout - 'row' or 'column'
 * @param {string} className - Additional CSS class
 * @param {boolean} showClearAll - Show clear all button
 * @param {Function} onClearAll - Callback for clear all
 * @param {number} activeFilterCount - Number of active filters
 */
export default function FilterBar({
  children,
  layout = 'row',
  className = '',
  showClearAll = false,
  onClearAll,
  activeFilterCount = 0
}) {
  const isRow = layout === 'row';

  return (
    <div
      className={`filter-bar ${className}`}
      style={{
        display: 'flex',
        flexDirection: isRow ? 'row' : 'column',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        marginBottom: 24,
        justifyContent: isRow ? 'space-between' : 'flex-start'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          flex: 1
        }}
      >
        {children}
      </div>

      {showClearAll && activeFilterCount > 0 && (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={onClearAll}
          style={{ fontSize: 12 }}
        >
          Clear Filters ({activeFilterCount})
        </button>
      )}
    </div>
  );
}
