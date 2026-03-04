import React from 'react';
import { getFieldIcon } from '../../utils/field-types';
import type { PlacedFieldItem } from './ProfileLayoutBuilder';

interface Props {
  field: PlacedFieldItem;
  previewMode: boolean;
  onRemove: () => void;
}

export default function PlacedField({ field, previewMode, onRemove }: Props) {
  return (
    <div className="placed-field">
      <div className="pf-info">
        <span className="pf-icon">{getFieldIcon(field.fieldType as any)}</span>
        <div className="pf-text">
          <span className="pf-name">{field.displayLabel || field.fieldName}</span>
          {field.fkPath && (
            <span className="pf-path">{field.sourceTableName}</span>
          )}
        </div>
      </div>

      {previewMode ? (
        <div className="pf-preview-value">—</div>
      ) : (
        <button className="pf-remove" onClick={onRemove} title="Remove field">
          ✕
        </button>
      )}
    </div>
  );
}
