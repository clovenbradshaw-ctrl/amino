import React, { useState, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { FieldDef } from '../../utils/field-types';
import { getFieldIcon } from '../../utils/field-types';
import type { TableInfo } from '../../state/SchemaContext';
import { getReachableFields } from '../../utils/fk-paths';

interface Props {
  tableId: string;
  fieldsByTable: Record<string, FieldDef[]>;
  tables: TableInfo[];
}

function DraggableField({ field, tableId, tableName, fkPath }: {
  field: FieldDef;
  tableId: string;
  tableName: string;
  fkPath?: string;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `schema_${field.fieldId}_${tableId}`,
    data: { field, tableId, tableName, fkPath },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`sp-field ${isDragging ? 'sp-field--dragging' : ''}`}
    >
      <span className="sp-field-icon">{getFieldIcon(field.fieldType)}</span>
      <span className="sp-field-name">{field.fieldName}</span>
      <span className="sp-field-type">{field.fieldType}</span>
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

  return (
    <div className="schema-panel">
      <div className="sp-header">
        <h3>Fields</h3>
      </div>

      <div className="sp-search">
        <input
          type="text"
          placeholder="Search fields…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="sp-groups">
        {Array.from(grouped.entries()).map(([tid, fields]) => {
          const filtered = search
            ? fields.filter(f => f.field.fieldName.toLowerCase().includes(search.toLowerCase()))
            : fields;
          if (filtered.length === 0) return null;

          const isExpanded = expandedTables.has(tid);
          const tableName = tableNames[tid] || tid;
          const isCurrentTable = tid === tableId;

          return (
            <div key={tid} className="sp-group">
              <div
                className={`sp-group-header ${isCurrentTable ? 'sp-group-header--primary' : ''}`}
                onClick={() => toggleTable(tid)}
              >
                <span className="sp-group-arrow">{isExpanded ? '▼' : '▶'}</span>
                <span className="sp-group-name">{tableName}</span>
                <span className="sp-group-count">{filtered.length}</span>
                {!isCurrentTable && <span className="sp-group-linked">linked</span>}
              </div>
              {isExpanded && (
                <div className="sp-group-fields">
                  {filtered.map(rf => (
                    <DraggableField
                      key={`${rf.field.fieldId}_${tid}`}
                      field={rf.field}
                      tableId={tid}
                      tableName={tableName}
                      fkPath={rf.path.segments.length > 0 ? rf.path.path : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
