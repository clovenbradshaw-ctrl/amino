import React, { useRef, useEffect } from 'react';
import type { FieldDef } from '@/utils/field-types';

interface TextCellProps {
  value: any;
  field: FieldDef;
  isEditing: boolean;
  onChange: (value: any) => void;
}

export function TextCell({ value, field, isEditing, onChange }: TextCellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  if (isEditing) {
    if (field.fieldType === 'multilineText') {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          defaultValue={value ?? ''}
          onBlur={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onChange(value);
          }}
        />
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={field.fieldType === 'email' ? 'email' : field.fieldType === 'url' ? 'url' : 'text'}
        defaultValue={value ?? ''}
        onBlur={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onChange((e.target as HTMLInputElement).value);
          if (e.key === 'Escape') onChange(value);
        }}
      />
    );
  }

  const displayValue = value != null ? String(value) : '';

  if (field.fieldType === 'url' && displayValue) {
    return (
      <a
        className="grid-cell-link"
        href={displayValue.startsWith('http') ? displayValue : `https://${displayValue}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
      >
        {displayValue}
      </a>
    );
  }

  if (field.fieldType === 'email' && displayValue) {
    return (
      <a
        className="grid-cell-link"
        href={`mailto:${displayValue}`}
        onClick={e => e.stopPropagation()}
      >
        {displayValue}
      </a>
    );
  }

  return <span className="grid-cell-text">{displayValue}</span>;
}
