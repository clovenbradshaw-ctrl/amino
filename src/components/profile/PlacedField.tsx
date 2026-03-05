import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { getFieldIcon } from '../../utils/field-types';
import type { PlacedFieldItem } from './ProfileLayoutBuilder';
import '../../styles/profile-builder.css';

const TABLE_COLORS = [
  '#1b7a4a', '#7b2d8b', '#b45309', '#1a5276', '#c0392b',
  '#6c3483', '#117864', '#a04000', '#2e4053', '#d4ac0d',
];

interface Props {
  field: PlacedFieldItem;
  previewMode: boolean;
  onRemove: () => void;
  onFKEdit?: () => void;
  sectionId?: string;
  colIdx?: number;
}

export default function PlacedField({ field, previewMode, onRemove, onFKEdit, sectionId, colIdx }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `placed_${field.id}`,
    data: {
      placedField: field,
      fromSectionId: sectionId,
      fromColIdx: colIdx,
    },
  });

  const color = TABLE_COLORS[
    Math.abs(field.sourceTableId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % TABLE_COLORS.length
  ] || '#888';

  if (previewMode) {
    return (
      <div className="preview-field-row">
        <span className="preview-field-row__label">{field.displayLabel || field.fieldName}</span>
        <span className="preview-field-row__value">{'\u2014'}</span>
        {field.fkPath && (
          <span className="preview-field-row__via" style={{ color, background: `${color}10` }}>
            via {field.sourceTableName}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`placed-field${isDragging ? ' placed-field--dragging' : ''}`}
      style={{ borderColor: `${color}25`, borderLeft: `3px solid ${color}` }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="placed-field__table-label" style={{ color }}>
            {field.sourceTableName}
          </span>
          <span className="placed-field__type-badge" style={{ background: '#eee' }}>
            {getFieldIcon(field.fieldType as any)}
          </span>
        </div>
        <div className="placed-field__name">{field.displayLabel || field.fieldName}</div>
        {field.fkPath && (
          <div className="fk-path-badge" style={{ marginTop: 2 }}>
            <span className="fk-path-badge__step" style={{ background: `${color}15`, color }}>
              {field.sourceTableName}
            </span>
            <span className="fk-path-badge__via">.{field.fkPath.split('>').pop()?.trim() || 'FK'}</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        {onFKEdit && (
          <button
            className="placed-field__fk-btn"
            style={{ color, borderColor: `${color}30` }}
            onClick={e => { e.stopPropagation(); onFKEdit(); }}
            title="Edit FK path"
          >
            FK
          </button>
        )}
        <button
          className="placed-field__remove-btn"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove field"
        >
          {'\u00D7'}
        </button>
      </div>
    </div>
  );
}
