import React, { createContext, useContext, useState, useCallback } from 'react';

export interface SortConfig {
  fieldId: string;
  direction: 'asc' | 'desc';
}

export interface FilterConfig {
  id: string;
  fieldId: string;
  operator: FilterOperator;
  value: any;
}

export type FilterOperator =
  | 'equals' | 'not_equals'
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'is_empty' | 'is_not_empty'
  | 'gt' | 'lt' | 'gte' | 'lte'
  | 'is_checked' | 'is_not_checked'
  | 'is_before' | 'is_after'
  | 'has_any' | 'has_all' | 'is_exactly';

export interface ViewState {
  tableId: string;
  viewId: string;
  viewName: string;
  sorts: SortConfig[];
  filters: FilterConfig[];
  groupByFieldId: string | null;
  hiddenFieldIds: string[];
  fieldOrder: string[];
  fieldWidths: Record<string, number>;
  searchQuery: string;
}

interface ViewContextValue {
  currentView: ViewState | null;
  views: ViewState[];
  setCurrentView: (view: ViewState) => void;
  updateView: (updates: Partial<ViewState>) => void;
  addSort: (sort: SortConfig) => void;
  removeSort: (fieldId: string) => void;
  clearSorts: () => void;
  addFilter: (filter: FilterConfig) => void;
  removeFilter: (filterId: string) => void;
  updateFilter: (filterId: string, updates: Partial<FilterConfig>) => void;
  clearFilters: () => void;
  setGroupBy: (fieldId: string | null) => void;
  toggleFieldVisibility: (fieldId: string) => void;
  setFieldOrder: (order: string[]) => void;
  setFieldWidth: (fieldId: string, width: number) => void;
  setSearchQuery: (query: string) => void;
  saveView: (view: ViewState) => void;
  deleteView: (viewId: string) => void;
}

function createDefaultView(tableId: string): ViewState {
  return {
    tableId,
    viewId: 'default',
    viewName: 'Grid view',
    sorts: [],
    filters: [],
    groupByFieldId: null,
    hiddenFieldIds: [],
    fieldOrder: [],
    fieldWidths: {},
    searchQuery: '',
  };
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: React.ReactNode }) {
  const [currentView, setCurrentViewState] = useState<ViewState | null>(null);
  const [views, setViews] = useState<ViewState[]>([]);

  const setCurrentView = useCallback((view: ViewState) => {
    setCurrentViewState(view);
  }, []);

  const updateView = useCallback((updates: Partial<ViewState>) => {
    setCurrentViewState(prev => prev ? { ...prev, ...updates } : prev);
  }, []);

  const addSort = useCallback((sort: SortConfig) => {
    setCurrentViewState(prev => {
      if (!prev) return prev;
      const existing = prev.sorts.findIndex(s => s.fieldId === sort.fieldId);
      const sorts = existing >= 0
        ? prev.sorts.map((s, i) => i === existing ? sort : s)
        : [...prev.sorts, sort];
      return { ...prev, sorts };
    });
  }, []);

  const removeSort = useCallback((fieldId: string) => {
    setCurrentViewState(prev => prev ? {
      ...prev,
      sorts: prev.sorts.filter(s => s.fieldId !== fieldId),
    } : prev);
  }, []);

  const clearSorts = useCallback(() => {
    setCurrentViewState(prev => prev ? { ...prev, sorts: [] } : prev);
  }, []);

  const addFilter = useCallback((filter: FilterConfig) => {
    setCurrentViewState(prev => prev ? {
      ...prev,
      filters: [...prev.filters, filter],
    } : prev);
  }, []);

  const removeFilter = useCallback((filterId: string) => {
    setCurrentViewState(prev => prev ? {
      ...prev,
      filters: prev.filters.filter(f => f.id !== filterId),
    } : prev);
  }, []);

  const updateFilter = useCallback((filterId: string, updates: Partial<FilterConfig>) => {
    setCurrentViewState(prev => prev ? {
      ...prev,
      filters: prev.filters.map(f => f.id === filterId ? { ...f, ...updates } : f),
    } : prev);
  }, []);

  const clearFilters = useCallback(() => {
    setCurrentViewState(prev => prev ? { ...prev, filters: [] } : prev);
  }, []);

  const setGroupBy = useCallback((fieldId: string | null) => {
    setCurrentViewState(prev => prev ? { ...prev, groupByFieldId: fieldId } : prev);
  }, []);

  const toggleFieldVisibility = useCallback((fieldId: string) => {
    setCurrentViewState(prev => {
      if (!prev) return prev;
      const hidden = prev.hiddenFieldIds.includes(fieldId)
        ? prev.hiddenFieldIds.filter(id => id !== fieldId)
        : [...prev.hiddenFieldIds, fieldId];
      return { ...prev, hiddenFieldIds: hidden };
    });
  }, []);

  const setFieldOrder = useCallback((order: string[]) => {
    setCurrentViewState(prev => prev ? { ...prev, fieldOrder: order } : prev);
  }, []);

  const setFieldWidth = useCallback((fieldId: string, width: number) => {
    setCurrentViewState(prev => prev ? {
      ...prev,
      fieldWidths: { ...prev.fieldWidths, [fieldId]: width },
    } : prev);
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setCurrentViewState(prev => prev ? { ...prev, searchQuery: query } : prev);
  }, []);

  const saveView = useCallback((view: ViewState) => {
    setViews(prev => {
      const idx = prev.findIndex(v => v.viewId === view.viewId);
      return idx >= 0 ? prev.map((v, i) => i === idx ? view : v) : [...prev, view];
    });
  }, []);

  const deleteView = useCallback((viewId: string) => {
    setViews(prev => prev.filter(v => v.viewId !== viewId));
  }, []);

  return (
    <ViewContext.Provider value={{
      currentView,
      views,
      setCurrentView,
      updateView,
      addSort,
      removeSort,
      clearSorts,
      addFilter,
      removeFilter,
      updateFilter,
      clearFilters,
      setGroupBy,
      toggleFieldVisibility,
      setFieldOrder,
      setFieldWidth,
      setSearchQuery,
      saveView,
      deleteView,
    }}>
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useView must be used within ViewProvider');
  return ctx;
}

export { createDefaultView };
