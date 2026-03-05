import React from 'react';
import type { FieldDef } from '@/utils/field-types';
import { useView } from '@/state/ViewContext';

interface GroupConfigProps {
  fields: FieldDef[];
}

export function GroupConfig({ fields }: GroupConfigProps) {
  const { currentView, setGroupBy } = useView();
  if (!currentView) return null;

  const groupFieldId = currentView.groupByFieldId;

  return (
    <div>
      <div className="grid-popover-title">Group by</div>
      <div className="grid-popover-row">
        <select
          value={groupFieldId || ''}
          onChange={e => setGroupBy(e.target.value || null)}
        >
          <option value="">No grouping</option>
          {fields.map(f => (
            <option key={f.fieldId} value={f.fieldId}>{f.fieldName}</option>
          ))}
        </select>
      </div>
      {groupFieldId && (
        <div className="grid-popover-actions">
          <button className="grid-popover-clear-btn" onClick={() => setGroupBy(null)}>
            Clear grouping
          </button>
        </div>
      )}
    </div>
  );
}
