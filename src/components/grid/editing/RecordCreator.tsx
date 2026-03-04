import React, { useState } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { isEditable, getFieldIcon } from '@/utils/field-types';
import { Modal } from '@/components/shared/Modal';

interface RecordCreatorProps {
  fields: FieldDef[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: Record<string, any>) => void;
}

export function RecordCreator({ fields, isOpen, onClose, onSave }: RecordCreatorProps) {
  const [values, setValues] = useState<Record<string, any>>({});

  const editableFields = fields.filter(f => isEditable(f.fieldType));

  const handleChange = (fieldName: string, value: any) => {
    setValues(prev => ({ ...prev, [fieldName]: value }));
  };

  const handleSave = () => {
    onSave(values);
    setValues({});
    onClose();
  };

  const handleCancel = () => {
    setValues({});
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleCancel} title="New Record" width={560}>
      <div className="grid-record-creator">
        {editableFields.map((field, index) => (
          <div key={field.fieldId} className="grid-record-creator-field">
            <label className={`grid-record-creator-label${index === 0 ? ' grid-record-creator-label--required' : ''}`}>
              {getFieldIcon(field.fieldType)} {field.fieldName}
            </label>
            {field.fieldType === 'checkbox' ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!values[field.fieldName]}
                  onChange={e => handleChange(field.fieldName, e.target.checked)}
                />
                {values[field.fieldName] ? 'Checked' : 'Unchecked'}
              </label>
            ) : field.fieldType === 'singleSelect' ? (
              <select
                className="grid-record-creator-input"
                value={values[field.fieldName] ?? ''}
                onChange={e => handleChange(field.fieldName, e.target.value || null)}
              >
                <option value="">--</option>
                {(field.options?.choices || field.options?.options || []).map((c: any) => (
                  <option key={c.id || c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            ) : field.fieldType === 'number' || field.fieldType === 'percent' || field.fieldType === 'currency' || field.fieldType === 'rating' ? (
              <input
                className="grid-record-creator-input"
                type="number"
                step="any"
                value={values[field.fieldName] ?? ''}
                onChange={e => {
                  const num = parseFloat(e.target.value);
                  handleChange(field.fieldName, isNaN(num) ? null : num);
                }}
              />
            ) : field.fieldType === 'date' || field.fieldType === 'dateTime' ? (
              <input
                className="grid-record-creator-input"
                type={field.fieldType === 'dateTime' ? 'datetime-local' : 'date'}
                value={values[field.fieldName] ?? ''}
                onChange={e => handleChange(field.fieldName, e.target.value || null)}
              />
            ) : field.fieldType === 'multilineText' ? (
              <textarea
                className="grid-record-creator-input"
                rows={3}
                value={values[field.fieldName] ?? ''}
                onChange={e => handleChange(field.fieldName, e.target.value)}
              />
            ) : (
              <input
                className="grid-record-creator-input"
                type={field.fieldType === 'email' ? 'email' : field.fieldType === 'url' ? 'url' : 'text'}
                value={values[field.fieldName] ?? ''}
                onChange={e => handleChange(field.fieldName, e.target.value)}
              />
            )}
          </div>
        ))}

        <div className="grid-record-creator-actions">
          <button className="grid-btn" onClick={handleCancel}>Cancel</button>
          <button className="grid-btn grid-btn--primary" onClick={handleSave}>Create Record</button>
        </div>
      </div>
    </Modal>
  );
}
