import React, { useState, useCallback } from 'react';
import { DndContext, DragEndEvent, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSchema } from '../../state/SchemaContext';
import type { FieldDef } from '../../utils/field-types';
import { generateId } from '../../utils/format';
import SchemaPanel from './SchemaPanel';
import LayoutCanvas from './LayoutCanvas';
import SummaryBar from './SummaryBar';
import TabStrip from './TabStrip';
import '../../styles/profile-builder.css';

export interface PlacedFieldItem {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldType: string;
  sourceTableId: string;
  sourceTableName: string;
  fkPath?: string;
  displayLabel?: string;
}

export interface LayoutSectionItem {
  id: string;
  title: string;
  columns: number;
  columnWidths?: number[];
  fields: PlacedFieldItem[][];
  collapsed?: boolean;
}

export interface TabItem {
  id: string;
  name: string;
  sections: LayoutSectionItem[];
}

export interface ProfileLayout {
  summaryFields: PlacedFieldItem[];
  tabs: TabItem[];
}

function createDefaultLayout(): ProfileLayout {
  return {
    summaryFields: [],
    tabs: [{
      id: `tab_${generateId()}`,
      name: 'General',
      sections: [{
        id: `section_${generateId()}`,
        title: 'Details',
        columns: 2,
        fields: [[], []],
      }],
    }],
  };
}

export default function ProfileLayoutBuilder() {
  const { tables, fieldsByTable } = useSchema();
  const [layout, setLayout] = useState<ProfileLayout>(createDefaultLayout);
  const [activeTabId, setActiveTabId] = useState<string>(layout.tabs[0]?.id || '');
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.tableId || '');
  const [draggedField, setDraggedField] = useState<FieldDef | null>(null);

  const activeTab = layout.tabs.find(t => t.id === activeTabId);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedField(null);

    if (!over || !active.data.current) return;

    const fieldData = active.data.current as { field: FieldDef; tableId: string; tableName: string; fkPath?: string };
    const overId = String(over.id);

    // Determine target section and column
    const match = overId.match(/^section_(.+)_col_(\d+)$/);
    if (!match) return;

    const sectionId = `section_${match[1]}`;
    const colIdx = parseInt(match[2]);

    const placed: PlacedFieldItem = {
      id: `placed_${generateId()}`,
      fieldId: fieldData.field.fieldId,
      fieldName: fieldData.field.fieldName,
      fieldType: fieldData.field.fieldType,
      sourceTableId: fieldData.tableId,
      sourceTableName: fieldData.tableName,
      fkPath: fieldData.fkPath,
    };

    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.map(section => {
          if (section.id !== sectionId) return section;
          const newFields = section.fields.map((col, i) =>
            i === colIdx ? [...col, placed] : col
          );
          return { ...section, fields: newFields };
        }),
      })),
    }));
  }, []);

  const handleAddTab = () => {
    const newTab: TabItem = {
      id: `tab_${generateId()}`,
      name: `Tab ${layout.tabs.length + 1}`,
      sections: [{
        id: `section_${generateId()}`,
        title: 'New Section',
        columns: 2,
        fields: [[], []],
      }],
    };
    setLayout(prev => ({ ...prev, tabs: [...prev.tabs, newTab] }));
    setActiveTabId(newTab.id);
  };

  const handleAddSection = () => {
    if (!activeTab) return;
    const newSection: LayoutSectionItem = {
      id: `section_${generateId()}`,
      title: 'New Section',
      columns: 2,
      fields: [[], []],
    };
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(t =>
        t.id === activeTabId
          ? { ...t, sections: [...t.sections, newSection] }
          : t
      ),
    }));
  };

  const handleRemoveField = (sectionId: string, colIdx: number, fieldIdx: number) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.map(section => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            fields: section.fields.map((col, i) =>
              i === colIdx ? col.filter((_, j) => j !== fieldIdx) : col
            ),
          };
        }),
      })),
    }));
  };

  const handleUpdateSection = (sectionId: string, updates: Partial<LayoutSectionItem>) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.map(section =>
          section.id === sectionId ? { ...section, ...updates } : section
        ),
      })),
    }));
  };

  const handleRemoveSection = (sectionId: string) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.filter(s => s.id !== sectionId),
      })),
    }));
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="profile-builder">
        <div className="pb-toolbar">
          <div className="pb-toolbar-left">
            <select
              value={selectedTableId}
              onChange={e => setSelectedTableId(e.target.value)}
              className="pb-table-select"
            >
              <option value="">Select table…</option>
              {tables.map(t => (
                <option key={t.tableId} value={t.tableId}>
                  {t.tableName || t.tableId}
                </option>
              ))}
            </select>
          </div>
          <div className="pb-toolbar-right">
            <button
              className={`pb-mode-btn ${previewMode ? '' : 'pb-mode-btn--active'}`}
              onClick={() => setPreviewMode(false)}
            >
              Edit
            </button>
            <button
              className={`pb-mode-btn ${previewMode ? 'pb-mode-btn--active' : ''}`}
              onClick={() => setPreviewMode(true)}
            >
              Preview
            </button>
            <button className="pb-save-btn">Save Layout</button>
          </div>
        </div>

        <div className="pb-content">
          {!previewMode && (
            <SchemaPanel
              tableId={selectedTableId}
              fieldsByTable={fieldsByTable}
              tables={tables}
            />
          )}

          <div className="pb-canvas-area">
            <SummaryBar
              fields={layout.summaryFields}
              editable={!previewMode}
            />

            <TabStrip
              tabs={layout.tabs}
              activeTabId={activeTabId}
              onSelectTab={setActiveTabId}
              onAddTab={handleAddTab}
              onRenameTab={(tabId, name) => {
                setLayout(prev => ({
                  ...prev,
                  tabs: prev.tabs.map(t => t.id === tabId ? { ...t, name } : t),
                }));
              }}
              onRemoveTab={(tabId) => {
                setLayout(prev => ({
                  ...prev,
                  tabs: prev.tabs.filter(t => t.id !== tabId),
                }));
                if (activeTabId === tabId) {
                  setActiveTabId(layout.tabs[0]?.id || '');
                }
              }}
            />

            {activeTab && (
              <LayoutCanvas
                sections={activeTab.sections}
                previewMode={previewMode}
                onAddSection={handleAddSection}
                onRemoveField={handleRemoveField}
                onUpdateSection={handleUpdateSection}
                onRemoveSection={handleRemoveSection}
              />
            )}
          </div>
        </div>
      </div>

      <DragOverlay>
        {draggedField && (
          <div className="pb-drag-overlay">
            {draggedField.fieldName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
