import React from 'react';
import type { FieldDef } from '@/utils/field-types';
import { useView } from '@/state/ViewContext';

interface SortConfigProps {
  fields: FieldDef[];
}

export function SortConfig({ fields }: SortConfigProps) {
  const { currentView, addSort, removeSort, clearSorts } = useView();
  if (!currentView) return null;

  const sorts = currentView.sorts;

  const handleAddSort = () => {
    if (fields.length === 0) return;
    // Find a field not already sorted
    const unsorted = fields.find(f => !sorts.some(s => s.fieldId === f.fieldId));
    const fieldId = unsorted?.fieldId || fields[0].fieldId;
    addSort({ fieldId, direction: 'asc' });
  };

  return (
    <div>
      <div className="grid-popover-title">Sort</div>
      {sorts.map(sort => {
        const field = fields.find(f => f.fieldId === sort.fieldId);
        return (
          <div key={sort.fieldId} className="grid-popover-row">
            <select
              value={sort.fieldId}
              onChange={e => {
                removeSort(sort.fieldId);
                addSort({ fieldId: e.target.value, direction: sort.direction });
              }}
            >
              {fields.map(f => (
                <option key={f.fieldId} value={f.fieldId}>{f.fieldName}</option>
              ))}
            </select>
            <select
              value={sort.direction}
              onChange={e => addSort({ fieldId: sort.fieldId, direction: e.target.value as 'asc' | 'desc' })}
            >
              <option value="asc">A {'\u2192'} Z</option>
              <option value="desc">Z {'\u2192'} A</option>
            </select>
            <button
              className="grid-popover-remove-btn"
              onClick={() => removeSort(sort.fieldId)}
            >
              &times;
            </button>
          </div>
        );
      })}
      <div className="grid-popover-actions">
        <button className="grid-popover-add-btn" onClick={handleAddSort}>
          + Add sort
        </button>
        {sorts.length > 0 && (
          <button className="grid-popover-clear-btn" onClick={clearSorts}>
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
