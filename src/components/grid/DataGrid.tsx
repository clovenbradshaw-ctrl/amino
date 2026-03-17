import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useSchema } from '@/state/SchemaContext';
import { useData } from '@/state/DataContext';
import { useView, createDefaultView, type SortConfig as SortCfg, type FilterConfig } from '@/state/ViewContext';
import { useFormulas } from '@/state/hooks/useFormulas';
import type { FieldDef } from '@/utils/field-types';
import { isEditable, formatCellValue } from '@/utils/field-types';
import type { AminoRecord } from '@/services/data/types';
import { sortBy, groupBy, generateId } from '@/utils/format';
import { Spinner } from '@/components/shared/Spinner';
import { EmptyState } from '@/components/shared/EmptyState';
import { GridHeader } from './GridHeader';
import { GridRow } from './GridRow';
import { GridToolbar } from './toolbar/GridToolbar';
import { ExpandedRow } from './editing/ExpandedRow';
import { RecordCreator } from './editing/RecordCreator';
import '@/styles/grid.css';

interface DataGridProps {
  tableId: string;
}

const PAGE_SIZE = 100;
const DEFAULT_COL_WIDTH = 180;

// ---- Mock data generator for standalone operation ----
function generateMockRecords(tableId: string, fields: FieldDef[], count: number = 50): AminoRecord[] {
  const records: AminoRecord[] = [];
  for (let i = 0; i < count; i++) {
    const fieldValues: Record<string, any> = {};
    for (const f of fields) {
      fieldValues[f.fieldName] = getMockValue(f, i);
    }
    records.push({
      id: `rec${tableId.slice(3)}${String(i).padStart(4, '0')}`,
      tableId,
      tableName: '',
      fields: fieldValues,
      lastSynced: new Date().toISOString(),
    });
  }
  return records;
}

function getMockValue(field: FieldDef, index: number): any {
  switch (field.fieldType) {
    case 'singleLineText': return `${field.fieldName} ${index + 1}`;
    case 'multilineText': return `Line 1 of record ${index + 1}\nLine 2`;
    case 'email': return `user${index + 1}@example.com`;
    case 'url': return `https://example.com/${index + 1}`;
    case 'phoneNumber': return `+1-555-${String(index + 100).padStart(4, '0')}`;
    case 'number': return Math.round(Math.random() * 1000);
    case 'percent': return Math.round(Math.random() * 100) / 100;
    case 'currency': return Math.round(Math.random() * 10000) / 100;
    case 'rating': return Math.floor(Math.random() * 5) + 1;
    case 'checkbox': return index % 3 === 0;
    case 'date': return new Date(2024, index % 12, (index % 28) + 1).toISOString();
    case 'dateTime': return new Date(2024, index % 12, (index % 28) + 1, index % 24, index % 60).toISOString();
    case 'singleSelect': {
      const choices = field.options?.choices || field.options?.options || [];
      return choices.length > 0 ? choices[index % choices.length]?.name : null;
    }
    case 'multipleSelects': {
      const choices = field.options?.choices || field.options?.options || [];
      if (choices.length === 0) return [];
      const count = (index % 3) + 1;
      return choices.slice(0, Math.min(count, choices.length)).map((c: any) => c.name);
    }
    case 'multipleRecordLinks': return Array.from({ length: (index % 3) + 1 }, (_, j) => `recLink${j}`);
    case 'createdTime': return new Date(2024, 0, index + 1).toISOString();
    case 'lastModifiedTime': return new Date().toISOString();
    case 'autoNumber': return index + 1;
    case 'count': return Math.floor(Math.random() * 20);
    case 'formula': return `=${index * 2}`;
    default: return null;
  }
}

// ---- Filter application ----
function applyFilter(value: any, operator: string, filterValue: any): boolean {
  const strVal = value != null ? String(value).toLowerCase() : '';
  const filterStr = filterValue != null ? String(filterValue).toLowerCase() : '';

  switch (operator) {
    case 'equals': return strVal === filterStr;
    case 'not_equals': return strVal !== filterStr;
    case 'contains': return strVal.includes(filterStr);
    case 'not_contains': return !strVal.includes(filterStr);
    case 'starts_with': return strVal.startsWith(filterStr);
    case 'ends_with': return strVal.endsWith(filterStr);
    case 'is_empty': return value == null || strVal === '';
    case 'is_not_empty': return value != null && strVal !== '';
    case 'gt': return Number(value) > Number(filterValue);
    case 'lt': return Number(value) < Number(filterValue);
    case 'gte': return Number(value) >= Number(filterValue);
    case 'lte': return Number(value) <= Number(filterValue);
    case 'is_checked': return !!value;
    case 'is_not_checked': return !value;
    case 'is_before': return new Date(value) < new Date(filterValue);
    case 'is_after': return new Date(value) > new Date(filterValue);
    case 'has_any':
      if (!Array.isArray(value)) return false;
      return filterStr.split(',').some((v: string) => value.map(String).includes(v.trim()));
    case 'has_all':
      if (!Array.isArray(value)) return false;
      return filterStr.split(',').every((v: string) => value.map(String).includes(v.trim()));
    case 'is_exactly':
      if (!Array.isArray(value)) return false;
      const expected = filterStr.split(',').map((v: string) => v.trim()).sort();
      const actual = value.map(String).sort();
      return JSON.stringify(actual) === JSON.stringify(expected);
    default: return true;
  }
}

export function DataGrid({ tableId }: DataGridProps) {
  const schema = useSchema();
  const data = useData();
  const view = useView();
  const { currentView, setCurrentView, addSort, removeSort, setFieldWidth } = view;

  // State
  const [localRecords, setLocalRecords] = useState<AminoRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ recordId: string; fieldId: string } | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [page, setPage] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fieldId: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load fields & records
  useEffect(() => {
    schema.loadFieldsForTable(tableId);
    data.loadRecords(tableId);
  }, [tableId, schema.loadFieldsForTable, data.loadRecords]);

  const allFields = schema.getFields(tableId);
  const loading = data.isLoading(tableId);

  // Push field_definition records (extracted from data stream) into schema.
  // These carry authoritative Airtable field metadata including formula expressions.
  const fieldDefs = data.getFieldDefinitions(tableId);
  useEffect(() => {
    if (fieldDefs.length > 0) {
      schema.applyFieldDefinitions(tableId, fieldDefs);
    }
  }, [fieldDefs, tableId, schema.applyFieldDefinitions]);

  // Derive field definitions from records when no other schema source is available
  const dataRecordsForDerive = data.getRecords(tableId);
  useEffect(() => {
    if (allFields.length === 0 && fieldDefs.length === 0 && dataRecordsForDerive.length > 0 && !loading) {
      schema.deriveFieldsFromRecords(tableId, dataRecordsForDerive);
    }
  }, [allFields.length, fieldDefs.length, dataRecordsForDerive, loading, tableId, schema.deriveFieldsFromRecords]);

  // Formula engine — compile and evaluate formula/rollup/lookup columns
  const { computeRecord } = useFormulas(tableId);

  // Bridge DataContext records (recordId) to AminoRecord (id) format,
  // applying formula computation to fill in computed column values.
  const dataRecords = data.getRecords(tableId);
  const records = useMemo(() => {
    if (dataRecords.length > 0) {
      return dataRecords.map(r => {
        // Evaluate formula/rollup/lookup fields if the engine is ready
        const computedFields = computeRecord
          ? computeRecord(r.fields, { recordId: r.recordId })
          : r.fields;
        return {
          id: r.recordId,
          tableId: r.tableId,
          tableName: '',
          fields: computedFields as Record<string, any>,
          lastSynced: new Date().toISOString(),
        };
      });
    }
    // Fallback to mock data when no real records are available (dev mode)
    if (allFields.length > 0 && !loading) {
      return generateMockRecords(tableId, allFields);
    }
    return localRecords;
  }, [dataRecords, allFields, loading, tableId, localRecords, computeRecord]);

  useEffect(() => {
    if (!currentView || currentView.tableId !== tableId) {
      setCurrentView(createDefaultView(tableId));
    }
  }, [tableId, currentView, setCurrentView]);

  // Visible fields — show ALL fields by default (including computed/formula);
  // only respect explicit user hide-actions from the current view.
  const visibleFields = useMemo(() => {
    if (!currentView) return allFields;
    let fields = allFields.filter(f => !currentView.hiddenFieldIds.includes(f.fieldId));
    if (currentView.fieldOrder.length > 0) {
      const orderMap = new Map(currentView.fieldOrder.map((id, i) => [id, i]));
      fields.sort((a, b) => (orderMap.get(a.fieldId) ?? 999) - (orderMap.get(b.fieldId) ?? 999));
    }
    return fields;
  }, [allFields, currentView]);

  // Field widths
  const fieldWidths = useMemo(() => {
    const widths: Record<string, number> = {};
    for (const f of visibleFields) {
      widths[f.fieldId] = currentView?.fieldWidths[f.fieldId] || DEFAULT_COL_WIDTH;
    }
    return widths;
  }, [visibleFields, currentView]);

  // Apply search filter
  const searchFiltered = useMemo(() => {
    const q = currentView?.searchQuery?.toLowerCase().trim();
    if (!q) return records;
    return records.filter(r =>
      visibleFields.some(f => {
        const v = r.fields[f.fieldName];
        return v != null && String(v).toLowerCase().includes(q);
      }),
    );
  }, [records, currentView?.searchQuery, visibleFields]);

  // Apply filters
  const filtered = useMemo(() => {
    if (!currentView || currentView.filters.length === 0) return searchFiltered;
    return searchFiltered.filter(record => {
      return currentView.filters.every(filter => {
        const field = allFields.find(f => f.fieldId === filter.fieldId);
        if (!field) return true;
        const value = record.fields[field.fieldName];
        return applyFilter(value, filter.operator, filter.value);
      });
    });
  }, [searchFiltered, currentView?.filters, allFields]);

  // Apply sorts
  const sorted = useMemo(() => {
    if (!currentView || currentView.sorts.length === 0) return filtered;
    return [...filtered].sort((a, b) => {
      for (const sort of currentView.sorts) {
        const field = allFields.find(f => f.fieldId === sort.fieldId);
        if (!field) continue;
        const va = a.fields[field.fieldName];
        const vb = b.fields[field.fieldName];
        if (va == null && vb == null) continue;
        if (va == null) return sort.direction === 'asc' ? 1 : -1;
        if (vb == null) return sort.direction === 'asc' ? -1 : 1;
        let cmp = 0;
        if (typeof va === 'string' && typeof vb === 'string') {
          cmp = va.localeCompare(vb);
        } else if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        if (cmp !== 0) return sort.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }, [filtered, currentView?.sorts, allFields]);

  // Apply grouping
  const grouped = useMemo(() => {
    if (!currentView?.groupByFieldId) return null;
    const field = allFields.find(f => f.fieldId === currentView.groupByFieldId);
    if (!field) return null;
    return groupBy(sorted, r => {
      const val = r.fields[field.fieldName];
      return val != null ? String(val) : '(empty)';
    });
  }, [sorted, currentView?.groupByFieldId, allFields]);

  // Flat list for display (respecting groups/pagination)
  const displayRecords = useMemo(() => {
    let result: AminoRecord[];
    if (grouped) {
      result = [];
      for (const [key, items] of Object.entries(grouped)) {
        if (!collapsedGroups.has(key)) {
          result.push(...items);
        }
      }
    } else {
      result = sorted;
    }
    // Paginate
    const start = page * PAGE_SIZE;
    return result.slice(start, start + PAGE_SIZE);
  }, [grouped, sorted, collapsedGroups, page]);

  const totalFilteredCount = grouped
    ? Object.values(grouped).reduce((sum, items) => sum + items.length, 0)
    : sorted.length;

  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: displayRecords.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 20,
  });

  // Handlers
  const handleSort = useCallback(
    (fieldId: string) => {
      if (!currentView) return;
      const existing = currentView.sorts.find(s => s.fieldId === fieldId);
      if (!existing) {
        addSort({ fieldId, direction: 'asc' });
      } else if (existing.direction === 'asc') {
        addSort({ fieldId, direction: 'desc' });
      } else {
        removeSort(fieldId);
      }
    },
    [currentView, addSort, removeSort],
  );

  const handleResize = useCallback(
    (fieldId: string, width: number) => {
      setFieldWidth(fieldId, width);
    },
    [setFieldWidth],
  );

  const handleCellClick = useCallback((recordId: string, fieldId: string) => {
    setSelectedRecordId(recordId);
  }, []);

  const handleCellDoubleClick = useCallback(
    (recordId: string, fieldId: string) => {
      const field = allFields.find(f => f.fieldId === fieldId);
      if (field && isEditable(field.fieldType)) {
        setEditingCell({ recordId, fieldId });
      }
    },
    [allFields],
  );

  const handleRowSelect = useCallback((recordId: string) => {
    setSelectedRecordId(recordId);
  }, []);

  const handleCellChange = useCallback(
    (recordId: string, fieldId: string, value: any) => {
      const field = allFields.find(f => f.fieldId === fieldId);
      if (!field) return;
      // Update in DataContext if real records exist
      if (dataRecords.length > 0) {
        data.updateRecord(tableId, recordId, { [field.fieldName]: value });
      } else {
        setLocalRecords(prev =>
          prev.map(r =>
            r.id === recordId
              ? { ...r, fields: { ...r.fields, [field.fieldName]: value } }
              : r,
          ),
        );
      }
      setEditingCell(null);
    },
    [allFields, dataRecords.length, data, tableId],
  );

  const handleExpandedSave = useCallback(
    (recordId: string, updates: Record<string, any>) => {
      if (dataRecords.length > 0) {
        data.updateRecord(tableId, recordId, updates);
      } else {
        setLocalRecords(prev =>
          prev.map(r =>
            r.id === recordId
              ? { ...r, fields: { ...r.fields, ...updates } }
              : r,
          ),
        );
      }
    },
    [dataRecords.length, data, tableId],
  );

  const handleCreateRecord = useCallback(
    (values: Record<string, any>) => {
      const newId = `rec${generateId()}`;
      if (dataRecords.length > 0) {
        data.addRecord(tableId, {
          tableId,
          recordId: newId,
          fields: values,
        });
      } else {
        const newRecord: AminoRecord = {
          id: newId,
          tableId,
          tableName: '',
          fields: values,
          lastSynced: new Date().toISOString(),
        };
        setLocalRecords(prev => [...prev, newRecord]);
      }
    },
    [tableId, dataRecords.length, data],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, fieldId: string) => {
      setContextMenu({ x: e.clientX, y: e.clientY, fieldId });
    },
    [],
  );

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleContextAction = useCallback(
    (action: string) => {
      if (!contextMenu) return;
      const { fieldId } = contextMenu;
      switch (action) {
        case 'sort-asc':
          addSort({ fieldId, direction: 'asc' });
          break;
        case 'sort-desc':
          addSort({ fieldId, direction: 'desc' });
          break;
        case 'hide':
          view.toggleFieldVisibility(fieldId);
          break;
        case 'group':
          view.setGroupBy(fieldId);
          break;
      }
      setContextMenu(null);
    },
    [contextMenu, addSort, view],
  );

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  const handleNavigateExpanded = useCallback(
    (direction: 'prev' | 'next') => {
      if (!expandedRecordId) return;
      const idx = displayRecords.findIndex(r => r.id === expandedRecordId);
      if (idx < 0) return;
      const newIdx = direction === 'prev' ? idx - 1 : idx + 1;
      if (newIdx >= 0 && newIdx < displayRecords.length) {
        setExpandedRecordId(displayRecords[newIdx].id);
      }
    },
    [expandedRecordId, displayRecords],
  );

  // Keyboard handler on grid body
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingCell(null);
        setContextMenu(null);
      }
    },
    [],
  );

  // Loading state
  if (loading && records.length === 0) {
    return (
      <div className="grid-container">
        <Spinner message="Loading records..." large />
      </div>
    );
  }

  // Empty state
  if (!loading && records.length === 0 && allFields.length === 0) {
    return (
      <div className="grid-container">
        <EmptyState
          icon="&#x1F4CB;"
          title="No data available"
          description="This table has no fields or records yet."
        />
      </div>
    );
  }

  const expandedRecord = expandedRecordId ? displayRecords.find(r => r.id === expandedRecordId) : null;
  const expandedIdx = expandedRecordId ? displayRecords.findIndex(r => r.id === expandedRecordId) : -1;

  return (
    <div className="grid-container" onKeyDown={handleKeyDown} tabIndex={-1}>
      <GridToolbar fields={allFields} totalRows={totalFilteredCount} />

      <div className="grid-body" ref={scrollRef}>
        <GridHeader
          fields={visibleFields}
          sorts={currentView?.sorts || []}
          fieldWidths={fieldWidths}
          onSort={handleSort}
          onResize={handleResize}
          onContextMenu={handleContextMenu}
        />

        <div
          className="grid-rows"
          style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
        >
          {grouped
            ? renderGrouped()
            : rowVirtualizer.getVirtualItems().map(virtualRow => {
                const record = displayRecords[virtualRow.index];
                if (!record) return null;
                return (
                  <GridRow
                    key={record.id}
                    record={record}
                    fields={visibleFields}
                    rowIndex={page * PAGE_SIZE + virtualRow.index}
                    isSelected={selectedRecordId === record.id}
                    editingFieldId={
                      editingCell?.recordId === record.id ? editingCell.fieldId : null
                    }
                    fieldWidths={fieldWidths}
                    onCellClick={handleCellClick}
                    onCellDoubleClick={handleCellDoubleClick}
                    onRowSelect={handleRowSelect}
                    onCellChange={handleCellChange}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  />
                );
              })}
        </div>

        {displayRecords.length === 0 && !loading && (
          <EmptyState
            icon="&#x1F50D;"
            title="No matching records"
            description="Try adjusting your filters or search query."
            actionLabel="Clear filters"
            onAction={() => {
              view.clearFilters();
              view.setSearchQuery('');
            }}
          />
        )}
      </div>

      <div className="grid-pagination">
        <div>
          Showing {Math.min(page * PAGE_SIZE + 1, totalFilteredCount)}-
          {Math.min((page + 1) * PAGE_SIZE, totalFilteredCount)} of {totalFilteredCount}
        </div>
        <div className="grid-pagination-controls">
          <button
            className="grid-pagination-btn"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.max(totalPages, 1)}
          </span>
          <button
            className="grid-pagination-btn"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </button>
          <button
            className="grid-btn grid-btn--primary"
            onClick={() => setShowCreator(true)}
            style={{ marginLeft: 8 }}
          >
            + New Record
          </button>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="grid-popover-backdrop" onClick={closeContextMenu} />
          <div
            className="grid-context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <div className="grid-context-menu-item" onClick={() => handleContextAction('sort-asc')}>
              {'\u2191'} Sort A {'\u2192'} Z
            </div>
            <div className="grid-context-menu-item" onClick={() => handleContextAction('sort-desc')}>
              {'\u2193'} Sort Z {'\u2192'} A
            </div>
            <div className="grid-context-menu-separator" />
            <div className="grid-context-menu-item" onClick={() => handleContextAction('group')}>
              {'\u2261'} Group by this field
            </div>
            <div className="grid-context-menu-item" onClick={() => handleContextAction('hide')}>
              {'\u2205'} Hide field
            </div>
          </div>
        </>
      )}

      {/* Expanded record modal */}
      {expandedRecord && (
        <ExpandedRow
          record={expandedRecord}
          fields={allFields}
          isOpen={true}
          onClose={() => setExpandedRecordId(null)}
          onSave={handleExpandedSave}
          onNavigate={handleNavigateExpanded}
          hasPrev={expandedIdx > 0}
          hasNext={expandedIdx < displayRecords.length - 1}
        />
      )}

      {/* Record creator modal */}
      <RecordCreator
        fields={allFields}
        isOpen={showCreator}
        onClose={() => setShowCreator(false)}
        onSave={handleCreateRecord}
      />
    </div>
  );

  function renderGrouped() {
    if (!grouped) return null;
    const groupField = allFields.find(f => f.fieldId === currentView?.groupByFieldId);
    let rowOffset = 0;

    return Object.entries(grouped).map(([groupKey, items]) => {
      const isCollapsed = collapsedGroups.has(groupKey);
      const header = (
        <div
          key={`group-${groupKey}`}
          className="grid-group-header"
          onClick={() => toggleGroupCollapse(groupKey)}
        >
          <span className={`grid-group-arrow${isCollapsed ? ' grid-group-arrow--collapsed' : ''}`}>
            {'\u25BC'}
          </span>
          <span>{groupField?.fieldName}: {groupKey}</span>
          <span className="grid-group-count">({items.length})</span>
        </div>
      );

      const rows = isCollapsed
        ? null
        : items.map((record, idx) => {
            const globalIdx = rowOffset + idx;
            return (
              <GridRow
                key={record.id}
                record={record}
                fields={visibleFields}
                rowIndex={page * PAGE_SIZE + globalIdx}
                isSelected={selectedRecordId === record.id}
                editingFieldId={
                  editingCell?.recordId === record.id ? editingCell.fieldId : null
                }
                fieldWidths={fieldWidths}
                onCellClick={handleCellClick}
                onCellDoubleClick={handleCellDoubleClick}
                onRowSelect={handleRowSelect}
                onCellChange={handleCellChange}
              />
            );
          });

      rowOffset += items.length;

      return (
        <React.Fragment key={groupKey}>
          {header}
          {rows}
        </React.Fragment>
      );
    });
  }
}

// Also export as default for backward compatibility
export default DataGrid;
