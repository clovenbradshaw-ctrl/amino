import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { LayoutSectionItem, PlacedFieldItem } from './ProfileLayoutBuilder';
import PlacedField from './PlacedField';
import SectionSettings from './SectionSettings';

interface Props {
  section: LayoutSectionItem;
  previewMode: boolean;
  onRemoveField: (colIdx: number, fieldIdx: number) => void;
  onUpdate: (updates: Partial<LayoutSectionItem>) => void;
  onRemove: () => void;
}

function DroppableColumn({ sectionId, colIdx, fields, previewMode, onRemoveField }: {
  sectionId: string;
  colIdx: number;
  fields: PlacedFieldItem[];
  previewMode: boolean;
  onRemoveField: (fieldIdx: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${sectionId}_col_${colIdx}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`ls-column ${isOver ? 'ls-column--over' : ''} ${fields.length === 0 ? 'ls-column--empty' : ''}`}
    >
      {fields.map((field, idx) => (
        <PlacedField
          key={field.id}
          field={field}
          previewMode={previewMode}
          onRemove={() => onRemoveField(idx)}
        />
      ))}
      {fields.length === 0 && !previewMode && (
        <div className="ls-column-placeholder">
          Drop fields here
        </div>
      )}
    </div>
  );
}

export default function LayoutSection({ section, previewMode, onRemoveField, onUpdate, onRemove }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(section.collapsed || false);

  return (
    <div className="layout-section">
      <div className="ls-header">
        <button
          className="ls-collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? '▶' : '▼'}
        </button>

        {!previewMode ? (
          <input
            className="ls-title-input"
            value={section.title}
            onChange={e => onUpdate({ title: e.target.value })}
            placeholder="Section title"
          />
        ) : (
          <span className="ls-title">{section.title}</span>
        )}

        {!previewMode && (
          <div className="ls-actions">
            <button className="ls-settings-btn" onClick={() => setShowSettings(!showSettings)}>
              ⚙
            </button>
            <button className="ls-remove-btn" onClick={onRemove}>
              ✕
            </button>
          </div>
        )}
      </div>

      {showSettings && !previewMode && (
        <SectionSettings
          section={section}
          onUpdate={onUpdate}
          onClose={() => setShowSettings(false)}
        />
      )}

      {!isCollapsed && (
        <div
          className="ls-columns"
          style={{
            gridTemplateColumns: section.columnWidths
              ? section.columnWidths.map(w => `${w}fr`).join(' ')
              : `repeat(${section.columns}, 1fr)`,
          }}
        >
          {Array.from({ length: section.columns }, (_, colIdx) => (
            <DroppableColumn
              key={colIdx}
              sectionId={section.id}
              colIdx={colIdx}
              fields={section.fields[colIdx] || []}
              previewMode={previewMode}
              onRemoveField={(fieldIdx) => onRemoveField(colIdx, fieldIdx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
