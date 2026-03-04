import React, { useState } from 'react';
import type { FieldDef, FieldType } from '../../utils/field-types';
import { useSchema } from '../../state/SchemaContext';
import { generateId } from '../../utils/format';

const FIELD_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'singleLineText', label: 'Single Line Text' },
  { value: 'multilineText', label: 'Long Text' },
  { value: 'richText', label: 'Rich Text' },
  { value: 'number', label: 'Number' },
  { value: 'percent', label: 'Percent' },
  { value: 'currency', label: 'Currency' },
  { value: 'email', label: 'Email' },
  { value: 'url', label: 'URL' },
  { value: 'phoneNumber', label: 'Phone Number' },
  { value: 'singleSelect', label: 'Single Select' },
  { value: 'multipleSelects', label: 'Multiple Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'dateTime', label: 'Date & Time' },
  { value: 'duration', label: 'Duration' },
  { value: 'rating', label: 'Rating' },
  { value: 'multipleRecordLinks', label: 'Link to Another Record' },
  { value: 'formula', label: 'Formula' },
  { value: 'rollup', label: 'Rollup' },
  { value: 'multipleLookupValues', label: 'Lookup' },
  { value: 'count', label: 'Count' },
];

interface Props {
  tableId: string;
  field: FieldDef | null;
  isNew: boolean;
  onClose: () => void;
}

export default function FieldEditor({ tableId, field, isNew, onClose }: Props) {
  const { updateField, addField, removeField } = useSchema();
  const [name, setName] = useState(field?.fieldName || '');
  const [type, setType] = useState<FieldType>(field?.fieldType || 'singleLineText');
  const [formula, setFormula] = useState(field?.options?.formula || '');
  const [isExcluded, setIsExcluded] = useState(field?.isExcluded || false);

  const isFormulaType = type === 'formula' || type === 'rollup';

  const handleSave = () => {
    if (!name.trim()) return;

    const fieldDef: FieldDef = {
      fieldId: field?.fieldId || `fld${generateId()}`,
      tableId,
      fieldName: name.trim(),
      fieldType: type,
      isComputed: ['formula', 'rollup', 'multipleLookupValues', 'count', 'autoNumber', 'createdTime', 'lastModifiedTime', 'createdBy', 'lastModifiedBy'].includes(type),
      isExcluded,
      options: isFormulaType ? { formula } : (field?.options || {}),
    };

    if (isNew || !field) {
      addField(tableId, fieldDef);
    } else {
      updateField(tableId, field.fieldId, fieldDef);
    }
    onClose();
  };

  const handleDelete = () => {
    if (field && confirm(`Delete field "${field.fieldName}"? This cannot be undone.`)) {
      removeField(tableId, field.fieldId);
      onClose();
    }
  };

  return (
    <div className="field-editor-overlay" onClick={onClose}>
      <div className="field-editor" onClick={e => e.stopPropagation()}>
        <div className="fe-header">
          <h3>{isNew ? 'Add Field' : 'Edit Field'}</h3>
          <button className="fe-close" onClick={onClose}>✕</button>
        </div>

        <div className="fe-body">
          <div className="fe-field">
            <label>Field Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Field name"
              autoFocus
            />
          </div>

          <div className="fe-field">
            <label>Field Type</label>
            <select value={type} onChange={e => setType(e.target.value as FieldType)}>
              {FIELD_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {isFormulaType && (
            <div className="fe-field">
              <label>Formula</label>
              <textarea
                value={formula}
                onChange={e => setFormula(e.target.value)}
                placeholder={type === 'formula' ? 'IF({Status} = "Active", 1, 0)' : 'SUM(values)'}
                rows={3}
                className="fe-formula"
              />
            </div>
          )}

          <div className="fe-field fe-checkbox-field">
            <label>
              <input
                type="checkbox"
                checked={isExcluded}
                onChange={e => setIsExcluded(e.target.checked)}
              />
              <span>Exclude from default views</span>
            </label>
          </div>

          {field && (
            <div className="fe-meta">
              <span>ID: {field.fieldId}</span>
              {field.isComputed && <span className="fe-computed-badge">Computed</span>}
            </div>
          )}
        </div>

        <div className="fe-footer">
          {field && !isNew && (
            <button className="fe-delete-btn" onClick={handleDelete}>Delete</button>
          )}
          <div className="fe-footer-spacer" />
          <button className="fe-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="fe-save-btn" onClick={handleSave} disabled={!name.trim()}>
            {isNew ? 'Add Field' : 'Save'}
          </button>
        </div>

        <style>{`
          .field-editor-overlay {
            position: fixed;
            inset: 0;
            background: var(--color-bg-overlay);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100;
          }

          .field-editor {
            background: var(--color-bg-modal);
            border-radius: var(--radius-xl);
            box-shadow: var(--shadow-xl);
            width: 100%;
            max-width: 480px;
            max-height: 80vh;
            overflow-y: auto;
          }

          .fe-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: var(--space-lg) var(--space-xl);
            border-bottom: 1px solid var(--color-border-light);
          }

          .fe-header h3 {
            font-size: var(--text-xl);
            font-weight: 600;
          }

          .fe-close {
            font-size: var(--text-lg);
            color: var(--color-text-muted);
            padding: var(--space-xs);
          }

          .fe-close:hover {
            color: var(--color-text-primary);
          }

          .fe-body {
            padding: var(--space-xl);
            display: flex;
            flex-direction: column;
            gap: var(--space-lg);
          }

          .fe-field {
            display: flex;
            flex-direction: column;
            gap: var(--space-xs);
          }

          .fe-field label {
            font-size: var(--text-sm);
            font-weight: 500;
            color: var(--color-text-secondary);
          }

          .fe-field input[type="text"],
          .fe-field select,
          .fe-field textarea {
            padding: 8px var(--space-md);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            font-size: var(--text-base);
          }

          .fe-field input:focus,
          .fe-field select:focus,
          .fe-field textarea:focus {
            outline: none;
            border-color: var(--color-accent);
            box-shadow: 0 0 0 3px var(--color-accent-light);
          }

          .fe-formula {
            font-family: var(--font-mono);
            font-size: var(--text-sm);
          }

          .fe-checkbox-field label {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            cursor: pointer;
            font-size: var(--text-base);
            font-weight: 400;
            color: var(--color-text-primary);
          }

          .fe-meta {
            display: flex;
            align-items: center;
            gap: var(--space-md);
            font-size: var(--text-xs);
            color: var(--color-text-muted);
            padding-top: var(--space-sm);
            border-top: 1px solid var(--color-border-light);
          }

          .fe-computed-badge {
            background: #f3e8ff;
            color: var(--color-cell-formula);
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 500;
          }

          .fe-footer {
            display: flex;
            align-items: center;
            gap: var(--space-sm);
            padding: var(--space-lg) var(--space-xl);
            border-top: 1px solid var(--color-border-light);
          }

          .fe-footer-spacer {
            flex: 1;
          }

          .fe-delete-btn {
            padding: 6px var(--space-md);
            color: var(--color-danger);
            font-size: var(--text-sm);
            border-radius: var(--radius-md);
          }

          .fe-delete-btn:hover {
            background: #fef2f2;
          }

          .fe-cancel-btn {
            padding: 6px var(--space-md);
            font-size: var(--text-sm);
            border-radius: var(--radius-md);
            color: var(--color-text-secondary);
          }

          .fe-cancel-btn:hover {
            background: var(--color-bg-secondary);
          }

          .fe-save-btn {
            padding: 6px var(--space-lg);
            background: var(--color-accent);
            color: white;
            font-size: var(--text-sm);
            font-weight: 500;
            border-radius: var(--radius-md);
          }

          .fe-save-btn:hover:not(:disabled) {
            background: var(--color-accent-hover);
          }

          .fe-save-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    </div>
  );
}
