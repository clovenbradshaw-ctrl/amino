import React, { useState, useEffect } from 'react';
import { useSchema, type TableInfo } from '../../state/SchemaContext';
import type { FieldDef, FieldType } from '../../utils/field-types';
import { getFieldIcon, COMPUTED_TYPES } from '../../utils/field-types';
import { generateId } from '../../utils/format';
import TableManager from './TableManager';
import FieldEditor from './FieldEditor';

export default function SchemaDesigner() {
  const { tables, fieldsByTable, loadTables, loadFieldsForTable, getFields } = useSchema();
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldDef | null>(null);
  const [showAddField, setShowAddField] = useState(false);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (selectedTableId) {
      loadFieldsForTable(selectedTableId);
    }
  }, [selectedTableId, loadFieldsForTable]);

  const fields = selectedTableId ? getFields(selectedTableId) : [];
  const selectedTable = tables.find(t => t.tableId === selectedTableId);

  return (
    <div className="schema-designer">
      <div className="schema-tables">
        <TableManager
          tables={tables}
          selectedTableId={selectedTableId}
          onSelectTable={setSelectedTableId}
        />
      </div>

      <div className="schema-fields">
        {selectedTable ? (
          <>
            <div className="schema-fields-header">
              <h2>{selectedTable.tableName}</h2>
              <span className="schema-fields-count">{fields.length} fields</span>
              <button className="schema-add-btn" onClick={() => setShowAddField(true)}>
                + Add Field
              </button>
            </div>

            <div className="schema-field-list">
              <div className="schema-field-list-header">
                <span className="sfh-icon"></span>
                <span className="sfh-name">Field Name</span>
                <span className="sfh-type">Type</span>
                <span className="sfh-computed">Computed</span>
                <span className="sfh-actions"></span>
              </div>
              {fields.map(field => (
                <div
                  key={field.fieldId}
                  className={`schema-field-row ${field.isComputed ? 'schema-field-row--computed' : ''} ${field.isExcluded ? 'schema-field-row--excluded' : ''}`}
                  onClick={() => setEditingField(field)}
                >
                  <span className="sf-icon">{getFieldIcon(field.fieldType)}</span>
                  <span className="sf-name">{field.fieldName}</span>
                  <span className="sf-type">{field.fieldType}</span>
                  <span className="sf-computed">{field.isComputed ? '✓' : ''}</span>
                  <span className="sf-actions">
                    <button
                      className="sf-edit-btn"
                      onClick={(e) => { e.stopPropagation(); setEditingField(field); }}
                    >
                      Edit
                    </button>
                  </span>
                </div>
              ))}
            </div>

            {(editingField || showAddField) && (
              <FieldEditor
                tableId={selectedTableId!}
                field={editingField}
                isNew={showAddField && !editingField}
                onClose={() => { setEditingField(null); setShowAddField(false); }}
              />
            )}
          </>
        ) : (
          <div className="schema-empty">
            <p>Select a table from the left to view and edit its fields.</p>
          </div>
        )}
      </div>

      <style>{`
        .schema-designer {
          display: flex;
          height: 100%;
        }

        .schema-tables {
          width: 280px;
          border-right: 1px solid var(--color-border);
          overflow-y: auto;
          flex-shrink: 0;
        }

        .schema-fields {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-xl);
        }

        .schema-fields-header {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          margin-bottom: var(--space-xl);
        }

        .schema-fields-header h2 {
          font-size: var(--text-2xl);
          font-weight: 600;
        }

        .schema-fields-count {
          color: var(--color-text-muted);
          font-size: var(--text-sm);
        }

        .schema-add-btn {
          margin-left: auto;
          padding: 6px var(--space-md);
          background: var(--color-accent);
          color: white;
          border-radius: var(--radius-md);
          font-size: var(--text-sm);
          font-weight: 500;
        }

        .schema-add-btn:hover {
          background: var(--color-accent-hover);
        }

        .schema-field-list {
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .schema-field-list-header {
          display: grid;
          grid-template-columns: 32px 1fr 140px 80px 60px;
          padding: var(--space-sm) var(--space-md);
          background: var(--color-bg-header);
          font-size: var(--text-xs);
          font-weight: 600;
          text-transform: uppercase;
          color: var(--color-text-muted);
          border-bottom: 1px solid var(--color-border);
        }

        .schema-field-row {
          display: grid;
          grid-template-columns: 32px 1fr 140px 80px 60px;
          padding: var(--space-sm) var(--space-md);
          border-bottom: 1px solid var(--color-border-light);
          cursor: pointer;
          transition: background var(--transition-fast);
          align-items: center;
        }

        .schema-field-row:last-child {
          border-bottom: none;
        }

        .schema-field-row:hover {
          background: var(--color-bg-row-hover);
        }

        .schema-field-row--computed .sf-name {
          color: var(--color-cell-formula);
          font-style: italic;
        }

        .schema-field-row--excluded {
          opacity: 0.5;
        }

        .sf-icon {
          font-size: var(--text-sm);
          opacity: 0.6;
          text-align: center;
        }

        .sf-name {
          font-weight: 500;
          font-size: var(--text-base);
        }

        .sf-type {
          font-size: var(--text-sm);
          color: var(--color-text-secondary);
        }

        .sf-computed {
          text-align: center;
          color: var(--color-cell-formula);
        }

        .sf-edit-btn {
          font-size: var(--text-xs);
          color: var(--color-accent);
          padding: 2px var(--space-sm);
          border-radius: var(--radius-sm);
        }

        .sf-edit-btn:hover {
          background: var(--color-accent-light);
        }

        .schema-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--color-text-muted);
          font-size: var(--text-lg);
        }
      `}</style>
    </div>
  );
}
