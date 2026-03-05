import React, { useCallback } from 'react';
import type { FieldDef } from '@/utils/field-types';
import type { AminoRecord } from '@/services/data/types';
import { classNames } from '@/utils/format';
import { GridCell } from './GridCell';

interface GridRowProps {
  record: AminoRecord;
  fields: FieldDef[];
  rowIndex: number;
  isSelected: boolean;
  editingFieldId: string | null;
  fieldWidths: Record<string, number>;
  onCellClick: (recordId: string, fieldId: string) => void;
  onCellDoubleClick: (recordId: string, fieldId: string) => void;
  onRowSelect: (recordId: string) => void;
  onCellChange: (recordId: string, fieldId: string, value: any) => void;
  style?: React.CSSProperties;
}

const DEFAULT_WIDTH = 180;

export function GridRow({
  record,
  fields,
  rowIndex,
  isSelected,
  editingFieldId,
  fieldWidths,
  onCellClick,
  onCellDoubleClick,
  onRowSelect,
  onCellChange,
  style,
}: GridRowProps) {
  const handleRowClick = useCallback(() => {
    onRowSelect(record.id);
  }, [record.id, onRowSelect]);

  return (
    <div
      className={classNames('grid-row', isSelected && 'grid-row--selected')}
      style={style}
      onClick={handleRowClick}
    >
      <div className="grid-row-number">{rowIndex + 1}</div>
      {fields.map(field => {
        const value = record.fields[field.fieldName];
        const isEditing = editingFieldId === field.fieldId;
        const width = fieldWidths[field.fieldId] || DEFAULT_WIDTH;

        return (
          <div
            key={field.fieldId}
            onClick={e => {
              e.stopPropagation();
              onCellClick(record.id, field.fieldId);
            }}
            onDoubleClick={e => {
              e.stopPropagation();
              onCellDoubleClick(record.id, field.fieldId);
            }}
          >
            <GridCell
              value={value}
              field={field}
              isEditing={isEditing}
              width={width}
              onChange={val => onCellChange(record.id, field.fieldId, val)}
            />
          </div>
        );
      })}
    </div>
  );
}
