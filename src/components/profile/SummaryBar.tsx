import React from 'react';
import type { PlacedFieldItem } from './ProfileLayoutBuilder';
import { getFieldIcon } from '../../utils/field-types';

interface Props {
  fields: PlacedFieldItem[];
  editable: boolean;
}

export default function SummaryBar({ fields, editable }: Props) {
  if (fields.length === 0 && !editable) return null;

  return (
    <div className="summary-bar">
      <div className="sb-label">Summary</div>
      <div className="sb-fields">
        {fields.map(field => (
          <div key={field.id} className="sb-field">
            <span className="sb-field-icon">{getFieldIcon(field.fieldType as any)}</span>
            <span className="sb-field-name">{field.fieldName}</span>
            <span className="sb-field-value">—</span>
          </div>
        ))}
        {fields.length === 0 && editable && (
          <div className="sb-empty">Drag fields here for the summary bar</div>
        )}
      </div>
    </div>
  );
}
