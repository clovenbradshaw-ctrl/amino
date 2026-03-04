import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { LayoutSectionItem, PlacedFieldItem } from './ProfileLayoutBuilder';
import LayoutSection from './LayoutSection';

interface Props {
  sections: LayoutSectionItem[];
  previewMode: boolean;
  onAddSection: () => void;
  onRemoveField: (sectionId: string, colIdx: number, fieldIdx: number) => void;
  onUpdateSection: (sectionId: string, updates: Partial<LayoutSectionItem>) => void;
  onRemoveSection: (sectionId: string) => void;
}

export default function LayoutCanvas({
  sections,
  previewMode,
  onAddSection,
  onRemoveField,
  onUpdateSection,
  onRemoveSection,
}: Props) {
  return (
    <div className="layout-canvas">
      {sections.map(section => (
        <LayoutSection
          key={section.id}
          section={section}
          previewMode={previewMode}
          onRemoveField={(colIdx, fieldIdx) => onRemoveField(section.id, colIdx, fieldIdx)}
          onUpdate={(updates) => onUpdateSection(section.id, updates)}
          onRemove={() => onRemoveSection(section.id)}
        />
      ))}

      {!previewMode && (
        <button className="lc-add-section" onClick={onAddSection}>
          + Add Section
        </button>
      )}
    </div>
  );
}
