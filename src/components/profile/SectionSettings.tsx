import React from 'react';
import type { LayoutSectionItem } from './ProfileLayoutBuilder';

interface Props {
  section: LayoutSectionItem;
  onUpdate: (updates: Partial<LayoutSectionItem>) => void;
  onClose: () => void;
}

export default function SectionSettings({ section, onUpdate, onClose }: Props) {
  const handleColumnChange = (columns: number) => {
    const currentFields = section.fields;
    // Adjust fields array to match column count
    const newFields: typeof currentFields = [];
    for (let i = 0; i < columns; i++) {
      newFields.push(currentFields[i] || []);
    }
    // If reducing columns, move excess fields to last column
    if (columns < currentFields.length) {
      for (let i = columns; i < currentFields.length; i++) {
        newFields[columns - 1] = [...newFields[columns - 1], ...currentFields[i]];
      }
    }
    onUpdate({ columns, fields: newFields, columnWidths: undefined });
  };

  return (
    <div className="section-settings">
      <div className="ss-row">
        <label>Columns</label>
        <div className="ss-column-options">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n}
              className={`ss-col-btn ${section.columns === n ? 'ss-col-btn--active' : ''}`}
              onClick={() => handleColumnChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="ss-row">
        <label>Title</label>
        <input
          type="text"
          value={section.title}
          onChange={e => onUpdate({ title: e.target.value })}
          className="ss-input"
        />
      </div>

      <div className="ss-row">
        <label>
          <input
            type="checkbox"
            checked={section.collapsed || false}
            onChange={e => onUpdate({ collapsed: e.target.checked })}
          />
          <span>Collapsed by default</span>
        </label>
      </div>

      <button className="ss-close" onClick={onClose}>Done</button>
    </div>
  );
}
