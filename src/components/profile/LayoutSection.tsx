import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { LayoutSectionItem, PlacedFieldItem } from './ProfileLayoutBuilder';
import PlacedField from './PlacedField';
import SectionSettings from './SectionSettings';
import '../../styles/profile-builder.css';

interface Props {
  section: LayoutSectionItem;
  previewMode: boolean;
  onRemoveField: (colIdx: number, fieldIdx: number) => void;
  onUpdate: (updates: Partial<LayoutSectionItem>) => void;
  onRemove: () => void;
  onFKEdit?: (colIdx: number, fieldIdx: number, field: PlacedFieldItem) => void;
}

function DroppableColumn({ sectionId, colIdx, fields, previewMode, onRemoveField, onFKEdit }: {
  sectionId: string;
  colIdx: number;
  fields: PlacedFieldItem[];
  previewMode: boolean;
  onRemoveField: (fieldIdx: number) => void;
  onFKEdit?: (fieldIdx: number, field: PlacedFieldItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${sectionId}_col_${colIdx}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`drop-col${isOver ? ' drop-col--hover' : ''}`}
    >
      {fields.map((field, idx) => (
        <PlacedField
          key={field.id}
          field={field}
          previewMode={previewMode}
          onRemove={() => onRemoveField(idx)}
          onFKEdit={onFKEdit ? () => onFKEdit(idx, field) : undefined}
        />
      ))}
      {fields.length === 0 && !previewMode && (
        <div className="drop-col__placeholder">Drop here</div>
      )}
    </div>
  );
}

export default function LayoutSection({ section, previewMode, onRemoveField, onUpdate, onRemove, onFKEdit }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(section.collapsed || false);

  const widthClass = `layout-section--${section.width || 'full'}`;

  return (
    <div className={`layout-section ${previewMode ? 'layout-section--preview' : ''} ${widthClass}`}>
      {previewMode ? (
        <div style={{ padding: '11px 16px', borderBottom: '1px solid #eee', fontWeight: 700, fontSize: 13, color: '#1a1a2e' }}>
          {section.title}
        </div>
      ) : (
        <div className="section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#888', padding: 0 }}
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? '\u25B6' : '\u25BC'}
            </button>
            <span className="section-header__name">{section.title}</span>
            <span className="section-header__meta">
              {section.columns}col \u00B7 {section.width || 'full'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="section-header__settings-btn"
              onClick={() => setShowSettings(!showSettings)}
            >
              \u2699
            </button>
            <button
              className="section-header__settings-btn"
              style={{ color: '#c0392b', borderColor: '#e8c4c4' }}
              onClick={onRemove}
            >
              \u2715
            </button>
          </div>
        </div>
      )}

      {showSettings && !previewMode && (
        <SectionSettings
          section={section}
          onUpdate={onUpdate}
          onClose={() => setShowSettings(false)}
        />
      )}

      {!isCollapsed && (
        <>
          {/* Column headers (edit mode) */}
          {!previewMode && section.columns > 1 && (
            <div className="section-col-labels">
              {Array.from({ length: section.columns }, (_, c) => (
                <div key={c} className="drop-col__label">Col {c + 1}</div>
              ))}
            </div>
          )}

          {/* Columns with fields */}
          <div className={`section-columns${previewMode ? ' section-columns--preview' : ''}`}>
            {Array.from({ length: section.columns }, (_, colIdx) => (
              <DroppableColumn
                key={colIdx}
                sectionId={section.id}
                colIdx={colIdx}
                fields={section.fields[colIdx] || []}
                previewMode={previewMode}
                onRemoveField={(fieldIdx) => onRemoveField(colIdx, fieldIdx)}
                onFKEdit={onFKEdit
                  ? (fieldIdx, field) => onFKEdit(colIdx, fieldIdx, field)
                  : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
