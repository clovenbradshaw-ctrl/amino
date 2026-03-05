import React from 'react';
import type { LayoutSectionItem, PlacedFieldItem } from './ProfileLayoutBuilder';
import LayoutSection from './LayoutSection';
import '../../styles/profile-builder.css';

interface Props {
  sections: LayoutSectionItem[];
  previewMode: boolean;
  onAddSection: () => void;
  onRemoveField: (sectionId: string, colIdx: number, fieldIdx: number) => void;
  onUpdateSection: (sectionId: string, updates: Partial<LayoutSectionItem>) => void;
  onRemoveSection: (sectionId: string) => void;
  /** Optional: callback when FK button is clicked on a placed field */
  onFKEdit?: (sectionId: string, colIdx: number, fieldIdx: number, field: PlacedFieldItem) => void;
}

export default function LayoutCanvas({
  sections,
  previewMode,
  onAddSection,
  onRemoveField,
  onUpdateSection,
  onRemoveSection,
  onFKEdit,
}: Props) {
  return (
    <div className="sections-wrap">
      {sections.map(section => (
        <LayoutSection
          key={section.id}
          section={section}
          previewMode={previewMode}
          onRemoveField={(colIdx, fieldIdx) => onRemoveField(section.id, colIdx, fieldIdx)}
          onUpdate={(updates) => onUpdateSection(section.id, updates)}
          onRemove={() => onRemoveSection(section.id)}
          onFKEdit={onFKEdit
            ? (colIdx, fieldIdx, field) => onFKEdit(section.id, colIdx, fieldIdx, field)
            : undefined
          }
        />
      ))}

      {!previewMode && (
        <button className="add-section-btn" onClick={onAddSection}>
          <span style={{ fontSize: 16, fontWeight: 300 }}>+</span> Add Section
        </button>
      )}
    </div>
  );
}
