import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { FieldDef } from '../../utils/field-types';
import { getFieldIcon } from '../../utils/field-types';
import type { TableInfo } from '../../state/SchemaContext';
import { getReachableFields } from '../../utils/fk-paths';
import '../../styles/profile-builder.css';

/* Type badge config ported from profile-layout-builder.html */
const TYPE_BADGES: Record<string, { label: string; bg: string }> = {
  singleLineText: { label: 'TEXT', bg: '#e8f4f0' },
  multilineText: { label: 'LONG', bg: '#e8f4f0' },
  richText: { label: 'RICH', bg: '#e8f4f0' },
  email: { label: 'EMAIL', bg: '#e8f0f4' },
  url: { label: 'URL', bg: '#e8f0f4' },
  phoneNumber: { label: 'PHONE', bg: '#f4f0e8' },
  number: { label: 'NUM', bg: '#e8f4e8' },
  currency: { label: '$', bg: '#e8f4e8' },
  percent: { label: '%', bg: '#e8f4e8' },
  date: { label: 'DATE', bg: '#fef3e2' },
  dateTime: { label: 'DATE', bg: '#fef3e2' },
  checkbox: { label: 'BOOL', bg: '#eee8f4' },
  singleSelect: { label: 'SEL', bg: '#eee8f4' },
  multipleSelects: { label: 'MULTI', bg: '#e8eef4' },
  multipleRecordLinks: { label: 'FK', bg: '#fde8e8' },
  multipleAttachments: { label: 'FILE', bg: '#f0e8f4' },
  formula: { label: 'FX', bg: '#e8e8f4' },
  rollup: { label: 'ROLL', bg: '#e8e8f4' },
  multipleLookupValues: { label: 'LOOK', bg: '#e8e8f4' },
  autoNumber: { label: 'AUTO', bg: '#e8f4e8' },
  rating: { label: 'RATE', bg: '#fef3e2' },
  count: { label: 'CNT', bg: '#e8f4e8' },
  createdTime: { label: 'DATE', bg: '#fef3e2' },
  lastModifiedTime: { label: 'DATE', bg: '#fef3e2' },
  createdBy: { label: 'USER', bg: '#e8f0f4' },
  lastModifiedBy: { label: 'USER', bg: '#e8f0f4' },
};
const DEFAULT_BADGE = { label: 'FIELD', bg: '#eee' };

const TABLE_COLORS = [
  '#1b7a4a', '#7b2d8b', '#b45309', '#1a5276', '#c0392b',
  '#6c3483', '#117864', '#a04000', '#2e4053', '#d4ac0d',
  '#1abc9c', '#e74c3c', '#3498db', '#f39c12', '#9b59b6',
];

interface Props {
  tableId: string;
  fieldsByTable: Record<string, FieldDef[]>;
  tables: TableInfo[];
}

function DraggableField({ field, tableId, tableName, fkPath, tableColor }: {
  field: FieldDef;
  tableId: string;
  tableName: string;
  fkPath?: string;
  tableColor?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `schema_${field.fieldId}_${tableId}`,
    data: { field, tableId, tableName, fkPath },
  });

  const badge = TYPE_BADGES[field.fieldType] || DEFAULT_BADGE;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`field-chip${isDragging ? ' field-chip--dragging' : ''}`}
    >
      <span
        className="field-chip__type-badge"
        style={{ background: badge.bg, color: '#666' }}
      >
        {badge.label}
      </span>
      <span className="field-chip__name">{field.fieldName}</span>
      {fkPath && (
        <span className="field-chip__fk-target" style={{ color: tableColor || '#888' }}>
          via FK
        </span>
      )}
    </div>
  );
}

export default function SchemaPanel({ tableId, fieldsByTable, tables }: Props) {
  const [search, setSearch] = useState('');
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set([tableId]));

  const tableNames = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach(t => { map[t.tableId] = t.tableName || t.tableId; });
    return map;
  }, [tables]);

  const tableColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach((t, i) => { map[t.tableId] = TABLE_COLORS[i % TABLE_COLORS.length]; });
    return map;
  }, [tables]);

  const reachableFields = useMemo(() => {
    if (!tableId) return [];
    return getReachableFields(tableId, fieldsByTable, tableNames, 2);
  }, [tableId, fieldsByTable, tableNames]);

  // Group by source table
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof reachableFields>();
    for (const rf of reachableFields) {
      const key = rf.path.targetTableId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(rf);
    }
    return groups;
  }, [reachableFields]);

  const toggleTable = (tid: string) => {
    setExpandedTables(prev => {
      const next = new Set(prev);
      if (next.has(tid)) next.delete(tid);
      else next.add(tid);
      return next;
    });
  };

  const searchLower = search.toLowerCase();

  return (
    <div className="schema-panel">
      <div className="schema-panel__header">
        <span className="schema-panel__header-dot" />
        <span className="schema-panel__header-title">Schema</span>
        <span className="schema-panel__header-badge">root: {tableNames[tableId] || '?'}</span>
      </div>

      <div className="schema-panel__search-wrap">
        <input
          className="schema-panel__search"
          type="text"
          placeholder="Search fields..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="schema-panel__list">
        {Array.from(grouped.entries()).map(([tid, fields]) => {
          const filtered = searchLower
            ? fields.filter(f =>
                f.field.fieldName.toLowerCase().includes(searchLower) ||
                (tableNames[tid] || '').toLowerCase().includes(searchLower))
            : fields;
          if (filtered.length === 0) return null;

          const isExpanded = expandedTables.has(tid) || !!searchLower;
          const tableName = tableNames[tid] || tid;
          const isCurrentTable = tid === tableId;
          const color = tableColorMap[tid] || '#888';

          return (
            <div key={tid}>
              <button
                className={`table-group__btn${isExpanded ? ' table-group__btn--expanded' : ''}`}
                style={{ borderLeft: `3px solid ${color}` }}
                onClick={() => toggleTable(tid)}
              >
                <span className="table-group__icon">{isCurrentTable ? '\u{1F4CB}' : '\u{1F517}'}</span>
                <span className="table-group__label">{tableName}</span>
                <span className="table-group__count">{filtered.length}</span>
                <span className={`table-group__chevron${isExpanded ? ' table-group__chevron--expanded' : ''}`}>
                  {'\u25B6'}
                </span>
              </button>
              {isExpanded && (
                <div className="table-group__fields">
                  {filtered.map(rf => (
                    <DraggableField
                      key={`${rf.field.fieldId}_${tid}`}
                      field={rf.field}
                      tableId={tid}
                      tableName={tableName}
                      fkPath={rf.path.segments.length > 0 ? rf.path.path : undefined}
                      tableColor={color}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {grouped.size === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#555', fontSize: 11 }}>
            {tableId ? 'No fields discovered' : 'Select a root table above'}
          </div>
        )}
      </div>

      <div className="schema-panel__footer">
        <div className="schema-panel__footer-title">Drag {'\u2192'} canvas</div>
        <div>Any field, any section. FK paths auto-resolved.</div>
      </div>
    </div>
  );
}
