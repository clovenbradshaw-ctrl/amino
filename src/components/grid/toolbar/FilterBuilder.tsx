import React, { useState } from 'react';
import type { FieldDef } from '@/utils/field-types';
import { TEXT_TYPES, NUMERIC_TYPES, DATE_TYPES } from '@/utils/field-types';
import { useView, type FilterOperator } from '@/state/ViewContext';
import { generateId } from '@/utils/format';

interface FilterBuilderProps {
  fields: FieldDef[];
}

function getOperatorsForField(field: FieldDef): { value: FilterOperator; label: string }[] {
  const base: { value: FilterOperator; label: string }[] = [
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ];

  if (TEXT_TYPES.includes(field.fieldType) || field.fieldType === 'singleSelect') {
    return [
      { value: 'equals', label: 'equals' },
      { value: 'not_equals', label: 'does not equal' },
      { value: 'contains', label: 'contains' },
      { value: 'not_contains', label: 'does not contain' },
      { value: 'starts_with', label: 'starts with' },
      { value: 'ends_with', label: 'ends with' },
      ...base,
    ];
  }

  if (NUMERIC_TYPES.includes(field.fieldType)) {
    return [
      { value: 'equals', label: '=' },
      { value: 'not_equals', label: '\u2260' },
      { value: 'gt', label: '>' },
      { value: 'gte', label: '\u2265' },
      { value: 'lt', label: '<' },
      { value: 'lte', label: '\u2264' },
      ...base,
    ];
  }

  if (DATE_TYPES.includes(field.fieldType)) {
    return [
      { value: 'equals', label: 'is' },
      { value: 'is_before', label: 'is before' },
      { value: 'is_after', label: 'is after' },
      ...base,
    ];
  }

  if (field.fieldType === 'checkbox') {
    return [
      { value: 'is_checked', label: 'is checked' },
      { value: 'is_not_checked', label: 'is not checked' },
    ];
  }

  if (field.fieldType === 'multipleSelects') {
    return [
      { value: 'has_any', label: 'has any of' },
      { value: 'has_all', label: 'has all of' },
      { value: 'is_exactly', label: 'is exactly' },
      ...base,
    ];
  }

  return [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'does not equal' },
    ...base,
  ];
}

const NO_VALUE_OPS: FilterOperator[] = ['is_empty', 'is_not_empty', 'is_checked', 'is_not_checked'];

export function FilterBuilder({ fields }: FilterBuilderProps) {
  const { currentView, addFilter, removeFilter, updateFilter, clearFilters } = useView();
  if (!currentView) return null;

  const filters = currentView.filters;

  const handleAddFilter = () => {
    if (fields.length === 0) return;
    const operators = getOperatorsForField(fields[0]);
    addFilter({
      id: generateId(),
      fieldId: fields[0].fieldId,
      operator: operators[0].value,
      value: '',
    });
  };

  const handleFieldChange = (filterId: string, fieldId: string) => {
    const field = fields.find(f => f.fieldId === fieldId);
    if (field) {
      const operators = getOperatorsForField(field);
      updateFilter(filterId, { fieldId, operator: operators[0].value, value: '' });
    }
  };

  return (
    <div>
      <div className="grid-popover-title">Filters</div>
      {filters.map(filter => {
        const field = fields.find(f => f.fieldId === filter.fieldId);
        const operators = field ? getOperatorsForField(field) : [];
        const needsValue = !NO_VALUE_OPS.includes(filter.operator);

        return (
          <div key={filter.id} className="grid-popover-row">
            <select
              value={filter.fieldId}
              onChange={e => handleFieldChange(filter.id, e.target.value)}
            >
              {fields.map(f => (
                <option key={f.fieldId} value={f.fieldId}>{f.fieldName}</option>
              ))}
            </select>
            <select
              value={filter.operator}
              onChange={e => updateFilter(filter.id, { operator: e.target.value as FilterOperator })}
            >
              {operators.map(op => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
            {needsValue && (
              <input
                type="text"
                value={filter.value ?? ''}
                placeholder="Value"
                onChange={e => updateFilter(filter.id, { value: e.target.value })}
              />
            )}
            <button
              className="grid-popover-remove-btn"
              onClick={() => removeFilter(filter.id)}
            >
              &times;
            </button>
          </div>
        );
      })}
      <div className="grid-popover-actions">
        <button className="grid-popover-add-btn" onClick={handleAddFilter}>
          + Add filter
        </button>
        {filters.length > 0 && (
          <button className="grid-popover-clear-btn" onClick={clearFilters}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
