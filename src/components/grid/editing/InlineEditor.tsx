import React, { useRef, useEffect, useCallback } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { TEXT_TYPES, NUMERIC_TYPES, DATE_TYPES, isEditable } from '@/utils/field-types';

interface InlineEditorProps {
  value: any;
  field: FieldDef;
  rect: { top: number; left: number; width: number; height: number };
  onSave: (value: any) => void;
  onCancel: () => void;
  onTab: (shiftKey: boolean) => void;
}

export function InlineEditor({ value, field, rect, onSave, onCancel, onTab }: InlineEditorProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const el = inputRef.current;
        if (el) {
          onSave(getValueFromElement(el, field));
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const el = inputRef.current;
        if (el) {
          onSave(getValueFromElement(el, field));
        }
        onTab(e.shiftKey);
      }
    },
    [field, onSave, onCancel, onTab],
  );

  const handleBlur = useCallback(() => {
    const el = inputRef.current;
    if (el) {
      onSave(getValueFromElement(el, field));
    }
  }, [field, onSave]);

  if (!isEditable(field.fieldType)) {
    return null;
  }

  const style: React.CSSProperties = {
    position: 'fixed',
    top: rect.top,
    left: rect.left,
    width: Math.max(rect.width, 120),
    height: rect.height,
  };

  if (field.fieldType === 'checkbox') {
    return (
      <div className="inline-editor" style={style}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="checkbox"
          defaultChecked={!!value}
          onChange={e => onSave(e.target.checked)}
          onKeyDown={handleKeyDown}
          style={{ margin: 'auto' }}
        />
      </div>
    );
  }

  if (NUMERIC_TYPES.includes(field.fieldType)) {
    return (
      <div className="inline-editor" style={style}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          step="any"
          defaultValue={value ?? ''}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </div>
    );
  }

  if (DATE_TYPES.includes(field.fieldType)) {
    const includeTime = field.fieldType === 'dateTime';
    let defaultVal = '';
    if (value) {
      try {
        const d = new Date(value);
        defaultVal = includeTime ? d.toISOString().slice(0, 16) : d.toISOString().slice(0, 10);
      } catch { /* ignore */ }
    }
    return (
      <div className="inline-editor" style={style}>
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={includeTime ? 'datetime-local' : 'date'}
          defaultValue={defaultVal}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
      </div>
    );
  }

  if (field.fieldType === 'singleSelect') {
    const choices = field.options?.choices || field.options?.options || [];
    return (
      <div className="inline-editor" style={style}>
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          defaultValue={value ?? ''}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onChange={e => onSave(e.target.value || null)}
        >
          <option value="">--</option>
          {choices.map((c: any) => (
            <option key={c.id || c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>
    );
  }

  // Default: text input
  return (
    <div className="inline-editor" style={style}>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        defaultValue={value ?? ''}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    </div>
  );
}

function getValueFromElement(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, field: FieldDef): any {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') {
      const num = parseFloat(el.value);
      return isNaN(num) ? null : num;
    }
    if (el.type === 'date' || el.type === 'datetime-local') {
      return el.value || null;
    }
  }
  return el.value;
}
