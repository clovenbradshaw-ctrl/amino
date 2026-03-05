import React, { useRef, useEffect } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { formatCellValue } from '@/utils/field-types';

interface DateCellProps {
  value: any;
  field: FieldDef;
  isEditing: boolean;
  onChange: (value: any) => void;
}

function toInputValue(value: any, includeTime: boolean): string {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    if (includeTime) {
      return d.toISOString().slice(0, 16);
    }
    return d.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

export function DateCell({ value, field, isEditing, onChange }: DateCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const includeTime = field.fieldType === 'dateTime' || field.fieldType === 'lastModifiedTime';

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="grid-cell-date-input"
        type={includeTime ? 'datetime-local' : 'date'}
        defaultValue={toInputValue(value, includeTime)}
        onBlur={e => onChange(e.target.value || null)}
        onKeyDown={e => {
          if (e.key === 'Enter') onChange((e.target as HTMLInputElement).value || null);
          if (e.key === 'Escape') onChange(value);
        }}
      />
    );
  }

  return (
    <span className="grid-cell-text">
      {formatCellValue(value, field.fieldType)}
    </span>
  );
}
