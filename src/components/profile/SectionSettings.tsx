import React from 'react';
import type { LayoutSectionItem } from './ProfileLayoutBuilder';
import '../../styles/profile-builder.css';

interface Props {
  section: LayoutSectionItem;
  onUpdate: (updates: Partial<LayoutSectionItem>) => void;
  onClose: () => void;
}

export default function SectionSettings({ section, onUpdate, onClose }: Props) {
  const handleColumnChange = (columns: number) => {
    const currentFields = section.fields;
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
      <div className="section-settings__title">Section Settings</div>

      <label className="section-settings__label">Name</label>
      <input
        className="section-settings__input"
        type="text"
        value={section.title}
        onChange={e => onUpdate({ title: e.target.value })}
      />

      <label className="section-settings__label" style={{ marginBottom: 6 }}>Columns</label>
      <div className="section-settings__col-row">
        {[1, 2, 3, 4].map(n => (
          <button
            key={n}
            className={`section-settings__col-btn${section.columns === n ? ' section-settings__col-btn--active' : ''}`}
            onClick={() => handleColumnChange(n)}
          >
            {n}
          </button>
        ))}
      </div>

      <label className="section-settings__label" style={{ marginBottom: 6 }}>Section Width</label>
      <div className="section-settings__width-row">
        {([['full', 'Full'], ['half', '\u00BD'], ['third', '\u2153']] as const).map(([value, label]) => (
          <button
            key={value}
            className={`section-settings__width-btn${(section.width || 'full') === value ? ' section-settings__width-btn--active' : ''}`}
            onClick={() => onUpdate({ width: value })}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#666', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={section.collapsed || false}
            onChange={e => onUpdate({ collapsed: e.target.checked })}
          />
          <span>Collapsed by default</span>
        </label>
      </div>

      <div className="section-settings__footer">
        <button className="section-settings__close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
