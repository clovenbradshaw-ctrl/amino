import React, { useState, useRef, useEffect } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { formatCellValue, getFieldIcon } from '@/utils/field-types';

interface FormulaCellProps {
  value: any;
  field: FieldDef;
  isEditing?: boolean;
  onChange?: (value: any) => void;
}

/**
 * Cell renderer for formula / rollup / lookup fields.
 * - For formula fields: click to edit the formula expression inline.
 * - For other computed types: displays the computed value; clicking opens a
 *   popover showing the formula definition.
 */
export function FormulaCell({ value, field, isEditing = false, onChange }: FormulaCellProps) {
  const [showPopover, setShowPopover] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        cellRef.current &&
        !cellRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPopover]);

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const formulaStr = field.options?.formula || '';
  const linkedTableId = field.options?.linkedTableId || null;
  const fieldIdInLinked = field.options?.fieldIdInLinkedTable || null;
  const resultType = field.options?.result?.type || null;

  const displayValue = formatCellValue(value, field.fieldType);

  // Editable formula field — show input for the formula expression
  if (isEditing && field.fieldType === 'formula' && onChange) {
    return (
      <div className="formula-cell formula-cell--editing" ref={cellRef}>
        <span className="formula-cell__edit-icon">ƒx</span>
        <input
          ref={inputRef}
          className="formula-cell__input"
          defaultValue={formulaStr}
          placeholder="Enter formula..."
          onBlur={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') onChange((e.target as HTMLInputElement).value);
            if (e.key === 'Escape') onChange(formulaStr); // revert
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      className="formula-cell"
      onClick={() => {
        // Only show popover for non-formula computed types
        if (field.fieldType !== 'formula') {
          setShowPopover(prev => !prev);
        }
      }}
    >
      <span className="formula-cell__value">{displayValue || '\u2014'}</span>
      <span className="formula-cell__indicator" title={field.fieldType === 'formula' ? 'Click to edit formula' : 'Click to see formula'}>
        {getFieldIcon(field.fieldType)}
      </span>

      {showPopover && (
        <div ref={popoverRef} className="formula-popover" onClick={e => e.stopPropagation()}>
          <div className="formula-popover__header">
            <span className="formula-popover__icon">{getFieldIcon(field.fieldType)}</span>
            <span className="formula-popover__title">{field.fieldName}</span>
            <span className="formula-popover__type">{field.fieldType}</span>
            <button className="formula-popover__close" onClick={() => setShowPopover(false)}>
              {'\u00D7'}
            </button>
          </div>

          <div className="formula-popover__body">
            {field.fieldType === 'formula' && (
              <div className="formula-popover__section">
                <div className="formula-popover__label">Formula</div>
                <pre className="formula-popover__code">{formulaStr || '(no formula defined)'}</pre>
              </div>
            )}

            {field.fieldType === 'rollup' && (
              <>
                <div className="formula-popover__section">
                  <div className="formula-popover__label">Aggregation</div>
                  <pre className="formula-popover__code">{formulaStr || 'ARRAYJOIN(values)'}</pre>
                </div>
                {linkedTableId && (
                  <div className="formula-popover__section">
                    <div className="formula-popover__label">Linked Table</div>
                    <div className="formula-popover__detail">{linkedTableId}</div>
                  </div>
                )}
              </>
            )}

            {(field.fieldType === 'multipleLookupValues' || field.fieldType as string === 'lookup') && (
              <>
                {linkedTableId && (
                  <div className="formula-popover__section">
                    <div className="formula-popover__label">Linked Table</div>
                    <div className="formula-popover__detail">{linkedTableId}</div>
                  </div>
                )}
                {fieldIdInLinked && (
                  <div className="formula-popover__section">
                    <div className="formula-popover__label">Field in Linked Table</div>
                    <div className="formula-popover__detail">{fieldIdInLinked}</div>
                  </div>
                )}
              </>
            )}

            {resultType && (
              <div className="formula-popover__section">
                <div className="formula-popover__label">Result Type</div>
                <div className="formula-popover__detail">{resultType}</div>
              </div>
            )}

            {field.fieldType === 'count' && (
              <div className="formula-popover__section">
                <div className="formula-popover__label">Type</div>
                <div className="formula-popover__detail">Counts linked records</div>
              </div>
            )}

            {(field.fieldType === 'createdTime' || field.fieldType === 'lastModifiedTime') && (
              <div className="formula-popover__section">
                <div className="formula-popover__label">Type</div>
                <div className="formula-popover__detail">
                  {field.fieldType === 'createdTime' ? 'Record creation timestamp' : 'Last modification timestamp'}
                </div>
              </div>
            )}

            {(field.fieldType === 'autoNumber') && (
              <div className="formula-popover__section">
                <div className="formula-popover__label">Type</div>
                <div className="formula-popover__detail">Auto-incrementing number</div>
              </div>
            )}

            <div className="formula-popover__section">
              <div className="formula-popover__label">Current Value</div>
              <div className="formula-popover__detail formula-popover__detail--value">
                {displayValue || '(empty)'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
