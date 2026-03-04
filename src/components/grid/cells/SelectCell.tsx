import React, { useRef, useEffect, useState } from 'react';
import type { FieldDef, SelectOption } from '@/utils/field-types';

interface SelectCellProps {
  value: any;
  field: FieldDef;
  isEditing: boolean;
  onChange: (value: any) => void;
}

const TAG_COLORS = [
  'blue', 'green', 'red', 'yellow', 'purple',
  'pink', 'orange', 'gray', 'teal', 'cyan',
];

function getTagColor(name: string, color?: string): string {
  if (color) {
    const c = color.toLowerCase();
    if (TAG_COLORS.includes(c)) return c;
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function getOptions(field: FieldDef): SelectOption[] {
  return field.options?.choices || field.options?.options || [];
}

export function SelectCell({ value, field, isEditing, onChange }: SelectCellProps) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const isMulti = field.fieldType === 'multipleSelects';
  const options = getOptions(field);

  useEffect(() => {
    if (isEditing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [isEditing]);

  if (isEditing) {
    if (isMulti) {
      const current: string[] = Array.isArray(value) ? value : value ? [value] : [];
      return (
        <select
          ref={selectRef}
          multiple
          defaultValue={current}
          onChange={e => {
            const selected = Array.from(e.target.selectedOptions).map(o => o.value);
            onChange(selected);
          }}
          onBlur={e => {
            const selected = Array.from(e.target.selectedOptions).map(o => o.value);
            onChange(selected);
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') onChange(value);
          }}
        >
          {options.map(opt => (
            <option key={opt.id || opt.name} value={opt.name}>
              {opt.name}
            </option>
          ))}
        </select>
      );
    }

    return (
      <select
        ref={selectRef}
        defaultValue={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        onBlur={e => onChange(e.target.value || null)}
        onKeyDown={e => {
          if (e.key === 'Escape') onChange(value);
        }}
      >
        <option value="">--</option>
        {options.map(opt => (
          <option key={opt.id || opt.name} value={opt.name}>
            {opt.name}
          </option>
        ))}
      </select>
    );
  }

  // Display mode
  const values: string[] = isMulti
    ? (Array.isArray(value) ? value : value ? [value] : [])
    : (value ? [String(value)] : []);

  if (values.length === 0) return null;

  return (
    <div className="grid-cell-tags">
      {values.map((v, i) => {
        const opt = options.find(o => o.name === v);
        const color = getTagColor(v, opt?.color);
        return (
          <span key={i} className={`grid-cell-tag grid-cell-tag--${color}`}>
            {v}
          </span>
        );
      })}
    </div>
  );
}
