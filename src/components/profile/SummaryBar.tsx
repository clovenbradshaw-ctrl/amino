import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { SummaryFieldItem } from './ProfileLayoutBuilder';
import { getFieldIcon } from '../../utils/field-types';
import '../../styles/profile-builder.css';

const TABLE_COLORS = [
  '#1b7a4a', '#7b2d8b', '#b45309', '#1a5276', '#c0392b',
  '#6c3483', '#117864', '#a04000', '#2e4053', '#d4ac0d',
];

function getColor(id: string): string {
  const hash = Math.abs(id.split('').reduce((a, c) => a + c.charCodeAt(0), 0));
  return TABLE_COLORS[hash % TABLE_COLORS.length];
}

interface Props {
  fields: SummaryFieldItem[];
  editable: boolean;
  onRemove?: (fieldId: string) => void;
  onFKEdit?: (fieldId: string) => void;
}

export default function SummaryBar({ fields, editable, onRemove, onFKEdit }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'summary-bar-drop' });

  if (fields.length === 0 && !editable) return null;

  return (
    <div
      ref={editable ? setNodeRef : undefined}
      className={`summary-bar${isOver && editable ? ' summary-bar--drop-hover' : ''}${fields.length === 0 && editable ? ' summary-bar--empty' : ''}`}
    >
      {fields.length === 0 && editable && (
        <span>Drag summary fields here</span>
      )}

      {fields.map(field => {
        const color = getColor(field.sourceTableId);
        return (
          <div key={field.id} className="summary-item" style={{ borderTop: `3px solid ${color}` }}>
            <div>
              <div className="summary-item__label" style={{ color }}>
                {field.fieldName}
              </div>
              <div className="summary-item__value">
                {editable ? 'Unknown' : '\u2014'}
              </div>
            </div>
            {editable && (
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                {onFKEdit && field.fkPath && (
                  <button
                    className="placed-field__fk-btn"
                    style={{ color, borderColor: `${color}30`, fontSize: 8 }}
                    onClick={() => onFKEdit(field.id)}
                    title="Edit FK path"
                  >
                    FK
                  </button>
                )}
                {onRemove && (
                  <button
                    className="summary-item__remove"
                    onClick={() => onRemove(field.id)}
                  >
                    {'\u00D7'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
