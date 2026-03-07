import React, { useState } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { getFieldIcon, formatCellValue, isEditable, COMPUTED_TYPES } from '@/utils/field-types';
import type { AminoRecord } from '@/services/data/types';
import { Modal } from '@/components/shared/Modal';

interface ExpandedRowProps {
  record: AminoRecord;
  fields: FieldDef[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (recordId: string, updates: Record<string, any>) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export function ExpandedRow({
  record,
  fields,
  isOpen,
  onClose,
  onSave,
  onNavigate,
  hasPrev,
  hasNext,
}: ExpandedRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});

  const handleEdit = () => {
    setDraft({ ...record.fields });
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft({});
  };

  const handleSave = () => {
    // Find changed fields
    const updates: Record<string, any> = {};
    for (const field of fields) {
      if (!isEditable(field.fieldType)) continue;
      if (draft[field.fieldName] !== record.fields[field.fieldName]) {
        updates[field.fieldName] = draft[field.fieldName];
      }
    }
    if (Object.keys(updates).length > 0) {
      onSave(record.id, updates);
    }
    setEditing(false);
    setDraft({});
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setDraft(prev => ({ ...prev, [fieldName]: value }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={record.fields[fields[0]?.fieldName] || record.id} width={640}>
      <div className="grid-expanded-row">
        {fields.map(field => {
          const value = editing ? draft[field.fieldName] : record.fields[field.fieldName];
          const canEdit = editing && isEditable(field.fieldType);

          const isFormulaType = COMPUTED_TYPES.includes(field.fieldType);
          const formulaStr = field.options?.formula || null;

          return (
            <div key={field.fieldId} className="grid-expanded-field">
              <div className="grid-expanded-field-label">
                <span>{getFieldIcon(field.fieldType)}</span>
                <span>{field.fieldName}</span>
                {field.isComputed && <span style={{ fontSize: 10, opacity: 0.6 }}>(computed)</span>}
              </div>
              {canEdit ? (
                <div className="grid-expanded-field-value grid-expanded-field-value--editing">
                  <input
                    type="text"
                    value={value != null ? String(value) : ''}
                    onChange={e => handleFieldChange(field.fieldName, e.target.value)}
                  />
                </div>
              ) : (
                <div className="grid-expanded-field-value">
                  {formatCellValue(value, field.fieldType) || '\u2014'}
                </div>
              )}
              {isFormulaType && formulaStr && (
                <div style={{
                  marginTop: 4,
                  padding: '6px 10px',
                  background: '#1a1a2e',
                  color: '#a5f3fc',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {formulaStr}
                </div>
              )}
            </div>
          );
        })}

        <div className="grid-expanded-nav">
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="grid-btn"
              disabled={!hasPrev}
              onClick={() => onNavigate('prev')}
            >
              {'\u2190'} Previous
            </button>
            <button
              className="grid-btn"
              disabled={!hasNext}
              onClick={() => onNavigate('next')}
            >
              Next {'\u2192'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editing ? (
              <>
                <button className="grid-btn" onClick={handleCancel}>Cancel</button>
                <button className="grid-btn grid-btn--primary" onClick={handleSave}>Save</button>
              </>
            ) : (
              <button className="grid-btn grid-btn--primary" onClick={handleEdit}>Edit</button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
