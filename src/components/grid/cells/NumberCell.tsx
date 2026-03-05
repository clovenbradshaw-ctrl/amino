import React, { useRef, useEffect } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { formatCellValue } from '@/utils/field-types';

interface NumberCellProps {
  value: any;
  field: FieldDef;
  isEditing: boolean;
  onChange: (value: any) => void;
}

export function NumberCell({ value, field, isEditing, onChange }: NumberCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (isEditing) {
    const handleSave = (raw: string) => {
      const num = parseFloat(raw);
      onChange(isNaN(num) ? null : num);
    };

    return (
      <input
        ref={inputRef}
        type="number"
        step={field.fieldType === 'percent' ? '0.01' : field.fieldType === 'currency' ? '0.01' : 'any'}
        defaultValue={value ?? ''}
        onBlur={e => handleSave(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') onChange(value);
        }}
      />
    );
  }

  if (field.fieldType === 'rating' && typeof value === 'number' && value > 0) {
    return <span className="grid-cell-rating">{formatCellValue(value, field.fieldType)}</span>;
  }

  return (
    <span className="grid-cell-text">
      {formatCellValue(value, field.fieldType)}
    </span>
  );
}
