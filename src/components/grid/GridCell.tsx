import React from 'react';
import type { FieldDef } from '@/utils/field-types';
import { TEXT_TYPES, NUMERIC_TYPES, DATE_TYPES, COMPUTED_TYPES, formatCellValue } from '@/utils/field-types';
import { classNames } from '@/utils/format';
import { TextCell } from './cells/TextCell';
import { NumberCell } from './cells/NumberCell';
import { DateCell } from './cells/DateCell';
import { CheckboxCell } from './cells/CheckboxCell';
import { SelectCell } from './cells/SelectCell';
import { LinkCell } from './cells/LinkCell';
import { FormulaCell } from './cells/FormulaCell';

interface GridCellProps {
  value: any;
  field: FieldDef;
  isEditing: boolean;
  onChange: (value: any) => void;
  width: number;
}

export function GridCell({ value, field, isEditing, onChange, width }: GridCellProps) {
  const isNumber = NUMERIC_TYPES.includes(field.fieldType);

  const className = classNames(
    'grid-cell',
    field.isComputed && 'grid-cell--computed',
    isEditing && 'grid-cell--editing',
    isNumber && 'grid-cell--number',
  );

  const renderContent = () => {
    const { fieldType } = field;

    // Formula fields — editable inline; other computed fields show read-only
    if (fieldType === 'formula') {
      return <FormulaCell value={value} field={field} isEditing={isEditing} onChange={onChange} />;
    }
    if (COMPUTED_TYPES.includes(fieldType)) {
      return <FormulaCell value={value} field={field} isEditing={false} onChange={onChange} />;
    }

    if (TEXT_TYPES.includes(fieldType)) {
      return <TextCell value={value} field={field} isEditing={isEditing} onChange={onChange} />;
    }

    if (NUMERIC_TYPES.includes(fieldType)) {
      return <NumberCell value={value} field={field} isEditing={isEditing} onChange={onChange} />;
    }

    if (DATE_TYPES.includes(fieldType)) {
      return <DateCell value={value} field={field} isEditing={isEditing} onChange={onChange} />;
    }

    if (fieldType === 'checkbox') {
      return <CheckboxCell value={value} isEditing={isEditing} onChange={onChange} />;
    }

    if (fieldType === 'singleSelect' || fieldType === 'multipleSelects') {
      return <SelectCell value={value} field={field} isEditing={isEditing} onChange={onChange} />;
    }

    if (fieldType === 'multipleRecordLinks') {
      return <LinkCell value={value} isEditing={isEditing} onChange={onChange} />;
    }

    // Fallback: display formatted value
    return <span className="grid-cell-text">{formatCellValue(value, fieldType)}</span>;
  };

  return (
    <div className={className} style={{ width, minWidth: width, maxWidth: width }}>
      {renderContent()}
    </div>
  );
}
