import { useState, useCallback, useMemo } from 'react';

/**
 * Centralized filter state management hook.
 * Provides a clean API for managing multiple filter states.
 * @param {Object} initialFilters - Initial filter values
 * @returns {Object} Filter state and management functions
 */
export default function useFilters(initialFilters = {}) {
  const [filters, setFiltersState] = useState(initialFilters);

  const setFilter = useCallback((key, value) => {
    setFiltersState(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const setFilters = useCallback((newFilters) => {
    setFiltersState(prev => ({
      ...prev,
      ...newFilters
    }));
  }, []);

  const resetFilters = useCallback((defaults = initialFilters) => {
    setFiltersState(defaults);
  }, [initialFilters]);

  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter(v => {
      if (v === '' || v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object' && v.range !== undefined) return v.range !== 'All Time';
      return true;
    }).length;
  }, [filters]);

  return {
    filters,
    setFilter,
    setFilters,
    resetFilters,
    activeFilterCount
  };
}
