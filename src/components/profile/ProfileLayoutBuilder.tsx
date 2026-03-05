import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  type DragStartEvent,
  type DragEndEvent,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useSchema } from '../../state/SchemaContext';
import type { FieldDef } from '../../utils/field-types';
import { getFieldIcon } from '../../utils/field-types';
import { generateId } from '../../utils/format';
import { findFKPaths } from '../../utils/fk-paths';
import type { FKPath } from '../../utils/fk-paths';
import SchemaPanel from './SchemaPanel';
import LayoutCanvas from './LayoutCanvas';
import SummaryBar from './SummaryBar';
import TabStrip from './TabStrip';
import FKPathPicker from './FKPathPicker';
import '../../styles/profile-builder.css';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PlacedFieldItem {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldType: string;
  sourceTableId: string;
  sourceTableName: string;
  fkPath?: string;
  fkPathObj?: FKPath;
  displayLabel?: string;
  column?: number;
}

export interface LayoutSectionItem {
  id: string;
  title: string;
  columns: number;
  width: 'full' | 'half' | 'third';
  columnWidths?: number[];
  fields: PlacedFieldItem[][];
  collapsed?: boolean;
}

export interface TabItem {
  id: string;
  name: string;
  sections: LayoutSectionItem[];
}

export interface SummaryFieldItem {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldType: string;
  sourceTableId: string;
  sourceTableName: string;
  fkPath?: string;
  fkPathObj?: FKPath;
}

export interface ProfileLayout {
  summaryFields: SummaryFieldItem[];
  tabs: TabItem[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
        width: 'full',
        fields: [[], []],
      }],
    }],
  };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProfileLayoutBuilder() {
  const { tables, fieldsByTable } = useSchema();
  const [layout, setLayout] = useState<ProfileLayout>(createDefaultLayout);
  const [activeTabId, setActiveTabId] = useState<string>(layout.tabs[0]?.id || '');
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.tableId || '');
  const [draggedField, setDraggedField] = useState<FieldDef | null>(null);

  // FK path picker modal state
  const [fkPickerState, setFkPickerState] = useState<{
    fieldUid: string;
    sourceTableId: string;
    sectionId?: string;
    colIdx?: number;
    fieldIdx?: number;
    isSummary?: boolean;
    paths: FKPath[];
    selectedPath: FKPath | null;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const activeTab = layout.tabs.find(t => t.id === activeTabId);

  const tableNames = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach(t => {
      map[t.tableId] = t.tableName || t.tableId;
    });
    return map;
  }, [tables]);

  const stats = useMemo(() => {
    const totalSections = layout.tabs.reduce((a, t) => a + t.sections.length, 0);
    const totalFields = layout.tabs.reduce(
      (a, t) => a + t.sections.reduce(
        (b, s) => b + s.fields.reduce((c, col) => c + col.length, 0), 0,
      ), 0,
    );
    return `${layout.tabs.length} tabs \u00B7 ${totalSections} sec \u00B7 ${totalFields} fields`;
  }, [layout]);

  /* ---- DnD handlers ---- */

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as Record<string, unknown> | undefined;
    if (data?.field) setDraggedField(data.field as FieldDef);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedField(null);
    if (!over || !active.data.current) return;

    const activeData = active.data.current as Record<string, unknown>;
    const overId = String(over.id);

    // Drop onto summary bar
    if (overId === 'summary-bar-drop') {
      const field = activeData.field as FieldDef | undefined;
      if (!field) return;
      const summaryItem: SummaryFieldItem = {
        id: `sf_${generateId()}`,
        fieldId: field.fieldId,
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        sourceTableId: activeData.tableId as string,
        sourceTableName: activeData.tableName as string,
        fkPath: activeData.fkPath as string | undefined,
      };
      setLayout(prev => ({
        ...prev,
        summaryFields: [...prev.summaryFields, summaryItem],
      }));
      return;
    }

    // Drop onto a section column
    const match = overId.match(/^section_(.+)_col_(\d+)$/);
    if (!match) return;
    const sectionId = `section_${match[1]}`;
    const colIdx = parseInt(match[2]);

    // New field from schema panel
    const field = activeData.field as FieldDef | undefined;
    if (field) {
      const placed: PlacedFieldItem = {
        id: `placed_${generateId()}`,
        fieldId: field.fieldId,
        fieldName: field.fieldName,
        fieldType: field.fieldType,
        sourceTableId: activeData.tableId as string,
        sourceTableName: activeData.tableName as string,
        fkPath: activeData.fkPath as string | undefined,
        column: colIdx,
      };
      setLayout(prev => ({
        ...prev,
        tabs: prev.tabs.map(tab => ({
          ...tab,
          sections: tab.sections.map(section => {
            if (section.id !== sectionId) return section;
            const newFields = section.fields.map((col, i) =>
              i === colIdx ? [...col, placed] : col,
            );
            return { ...section, fields: newFields };
          }),
        })),
      }));
      return;
    }

    // Move existing placed field
    const movedField = activeData.placedField as PlacedFieldItem | undefined;
    if (movedField) {
      const fromSectionId = activeData.fromSectionId as string;
      const fromColIdx = activeData.fromColIdx as number;
      setLayout(prev => ({
        ...prev,
        tabs: prev.tabs.map(tab => ({
          ...tab,
          sections: tab.sections.map(section => {
            if (section.id === fromSectionId) {
              const updated = section.fields.map((col, i) =>
                i === fromColIdx ? col.filter(f => f.id !== movedField.id) : col,
              );
              if (section.id === sectionId) {
                return {
                  ...section,
                  fields: updated.map((col, i) =>
                    i === colIdx ? [...col, { ...movedField, column: colIdx }] : col,
                  ),
                };
              }
              return { ...section, fields: updated };
            }
            if (section.id === sectionId && section.id !== fromSectionId) {
              return {
                ...section,
                fields: section.fields.map((col, i) =>
                  i === colIdx ? [...col, { ...movedField, column: colIdx }] : col,
                ),
              };
            }
            return section;
          }),
        })),
      }));
    }
  }, []);

  /* ---- Tab management ---- */

  const handleAddTab = useCallback(() => {
    const newTab: TabItem = {
      id: `tab_${generateId()}`,
      name: `Tab ${layout.tabs.length + 1}`,
      sections: [{
        id: `section_${generateId()}`,
        title: 'New Section',
        columns: 2,
        width: 'full',
        fields: [[], []],
      }],
    };
    setLayout(prev => ({ ...prev, tabs: [...prev.tabs, newTab] }));
    setActiveTabId(newTab.id);
  }, [layout.tabs.length]);

  const handleRenameTab = useCallback((tabId: string, name: string) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(t => (t.id === tabId ? { ...t, name } : t)),
    }));
  }, []);

  const handleRemoveTab = useCallback((tabId: string) => {
    if (layout.tabs.length <= 1) return;
    setLayout(prev => ({ ...prev, tabs: prev.tabs.filter(t => t.id !== tabId) }));
    if (activeTabId === tabId) {
      const remaining = layout.tabs.filter(t => t.id !== tabId);
      setActiveTabId(remaining[0]?.id || '');
    }
  }, [layout.tabs, activeTabId]);

  const handleReorderTabs = useCallback((ordered: string[]) => {
    setLayout(prev => {
      const map = new Map(prev.tabs.map(t => [t.id, t]));
      return { ...prev, tabs: ordered.map(id => map.get(id)!).filter(Boolean) };
    });
  }, []);

  /* ---- Section management ---- */

  const handleAddSection = useCallback(() => {
    if (!activeTab) return;
    const newSection: LayoutSectionItem = {
      id: `section_${generateId()}`,
      title: 'New Section',
      columns: 2,
      width: 'full',
      fields: [[], []],
    };
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(t =>
        t.id === activeTabId ? { ...t, sections: [...t.sections, newSection] } : t,
      ),
    }));
  }, [activeTab, activeTabId]);

  const handleUpdateSection = useCallback((sectionId: string, updates: Partial<LayoutSectionItem>) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.map(section =>
          section.id === sectionId ? { ...section, ...updates } : section,
        ),
      })),
    }));
  }, []);

  const handleRemoveSection = useCallback((sectionId: string) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.filter(s => s.id !== sectionId),
      })),
    }));
  }, []);

  /* ---- Field management ---- */

  const handleRemoveField = useCallback((sectionId: string, colIdx: number, fieldIdx: number) => {
    setLayout(prev => ({
      ...prev,
      tabs: prev.tabs.map(tab => ({
        ...tab,
        sections: tab.sections.map(section => {
          if (section.id !== sectionId) return section;
          return {
            ...section,
            fields: section.fields.map((col, i) =>
              i === colIdx ? col.filter((_, j) => j !== fieldIdx) : col,
            ),
          };
        }),
      })),
    }));
  }, []);

  const handleRemoveSummaryField = useCallback((fieldId: string) => {
    setLayout(prev => ({
      ...prev,
      summaryFields: prev.summaryFields.filter(f => f.id !== fieldId),
    }));
  }, []);

  /* ---- FK Path picker ---- */

  const handleOpenFKPicker = useCallback(
    (fieldUid: string, sourceTableId: string, sectionId?: string, colIdx?: number, fieldIdx?: number, isSummary?: boolean) => {
      const paths = findFKPaths(selectedTableId, fieldsByTable, tableNames);
      setFkPickerState({ fieldUid, sourceTableId, sectionId, colIdx, fieldIdx, isSummary, paths, selectedPath: null });
    },
    [selectedTableId, fieldsByTable, tableNames],
  );

  const handleSelectFKPath = useCallback((path: FKPath) => {
    setFkPickerState(prev => (prev ? { ...prev, selectedPath: path } : null));
  }, []);

  const handleSaveFKPath = useCallback(() => {
    if (!fkPickerState?.selectedPath) { setFkPickerState(null); return; }
    const path = fkPickerState.selectedPath;

    if (fkPickerState.isSummary) {
      setLayout(prev => ({
        ...prev,
        summaryFields: prev.summaryFields.map(f =>
          f.id === fkPickerState.fieldUid ? { ...f, fkPath: path.path, fkPathObj: path } : f,
        ),
      }));
    } else if (fkPickerState.sectionId != null && fkPickerState.colIdx != null && fkPickerState.fieldIdx != null) {
      const { sectionId, colIdx, fieldIdx } = fkPickerState;
      setLayout(prev => ({
        ...prev,
        tabs: prev.tabs.map(tab => ({
          ...tab,
          sections: tab.sections.map(sec => {
            if (sec.id !== sectionId) return sec;
            return {
              ...sec,
              fields: sec.fields.map((col, ci) => {
                if (ci !== colIdx) return col;
                return col.map((f, fi) =>
                  fi === fieldIdx ? { ...f, fkPath: path.path, fkPathObj: path } : f,
                );
              }),
            };
          }),
        })),
      }));
    }
    setFkPickerState(null);
  }, [fkPickerState]);

  /* ---- Save / Export ---- */

  const handleSave = useCallback(() => {
    const config = {
      version: 2,
      summaryFields: layout.summaryFields.map(f => f.fieldName),
      tabs: layout.tabs.map(tab => ({
        id: tab.id,
        label: tab.name,
        sections: tab.sections.map(sec => ({
          title: sec.title,
          type: 'fields',
          columns: sec.columns,
          width: sec.width,
          fields: sec.fields.flat().map(f => f.fieldName),
          _builderMeta: {
            columns: sec.columns,
            width: sec.width,
            fieldPlacements: sec.fields.flatMap((col, ci) =>
              col.map(f => ({ fieldId: f.fieldId, column: ci, fkPath: f.fkPath })),
            ),
          },
        })),
      })),
    };
    console.log('[ProfileBuilder] Save config:', config);
  }, [layout]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(layout, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'profile-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [layout]);

  /* ---- Render ---- */

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="profile-builder">
        {!previewMode && (
          <SchemaPanel tableId={selectedTableId} fieldsByTable={fieldsByTable} tables={tables} />
        )}

        <div className="builder-main">
          {/* Toolbar */}
          <div className="builder-toolbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 className="builder-toolbar__title">Profile Layout Builder</h1>
              <span className="builder-toolbar__stats">{stats}</span>
              <select
                value={selectedTableId}
                onChange={e => setSelectedTableId(e.target.value)}
                style={{
                  background: '#1e1e32', border: '1px solid #33334d', borderRadius: 5,
                  color: '#aaa', fontSize: 11, padding: '4px 8px', fontFamily: 'inherit',
                }}
              >
                <option value="">Select root table...</option>
                {tables.map(t => (
                  <option key={t.tableId} value={t.tableId}>{t.tableName || t.tableId}</option>
                ))}
              </select>
            </div>
            <div className="builder-toolbar__actions">
              <button
                className={`builder-toolbar-btn${previewMode ? ' builder-toolbar-btn--active' : ''}`}
                onClick={() => setPreviewMode(!previewMode)}
              >
                {previewMode ? 'Edit' : 'Preview'}
              </button>
              <button className="builder-toolbar-btn builder-toolbar-btn--primary" onClick={handleSave}>
                Save to Matrix
              </button>
              <button className="builder-toolbar-btn" onClick={handleExport}>
                Export JSON
              </button>
            </div>
          </div>

          {/* Canvas */}
          <div className={`builder-canvas ${previewMode ? 'builder-canvas--preview' : 'builder-canvas--edit'}`}>
            {/* Profile card header */}
            <div className="profile-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <h2 className="profile-card__title">{previewMode ? 'Client Name' : 'Client Profile'}</h2>
                  <span className="profile-card__subtitle">
                    {previewMode ? 'rec00Fr5TBcrZSHFI' : 'Summary fields \u2014 drop here'}
                  </span>
                </div>
                {previewMode && (
                  <button className="builder-toolbar-btn" onClick={() => setPreviewMode(false)}>Configure</button>
                )}
              </div>

              <SummaryBar
                fields={layout.summaryFields}
                editable={!previewMode}
                onRemove={handleRemoveSummaryField}
                onFKEdit={(fieldId) =>
                  handleOpenFKPicker(
                    fieldId,
                    layout.summaryFields.find(f => f.id === fieldId)?.sourceTableId || '',
                    undefined, undefined, undefined, true,
                  )
                }
              />
            </div>

            {/* Tabs */}
            <TabStrip
              tabs={layout.tabs}
              activeTabId={activeTabId}
              editable={!previewMode}
              onSelectTab={setActiveTabId}
              onAddTab={handleAddTab}
              onRenameTab={handleRenameTab}
              onRemoveTab={handleRemoveTab}
              onReorderTabs={handleReorderTabs}
            />

            {/* Sections */}
            {activeTab && (
              <LayoutCanvas
                sections={activeTab.sections}
                previewMode={previewMode}
                onAddSection={handleAddSection}
                onRemoveField={handleRemoveField}
                onUpdateSection={handleUpdateSection}
                onRemoveSection={handleRemoveSection}
                onFKEdit={(sectionId, colIdx, fieldIdx, field) =>
                  handleOpenFKPicker(field.id, field.sourceTableId, sectionId, colIdx, fieldIdx)
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {draggedField && (
          <div className="drag-overlay-field">
            <span style={{ marginRight: 4 }}>{getFieldIcon(draggedField.fieldType)}</span>
            {draggedField.fieldName}
          </div>
        )}
      </DragOverlay>

      {/* FK Path Picker modal */}
      {fkPickerState && (
        <div className="fk-modal__overlay" onClick={() => setFkPickerState(null)}>
          <div className="fk-modal" onClick={e => e.stopPropagation()}>
            <div className="fk-modal__header">
              <h3 className="fk-modal__header-title">Configure Foreign Key Path</h3>
              <div className="fk-modal__header-subtitle">
                Select the relationship path to resolve this field
              </div>
            </div>
            <div className="fk-modal__body">
              <FKPathPicker
                paths={fkPickerState.paths}
                selectedPath={fkPickerState.selectedPath}
                onSelectPath={handleSelectFKPath}
              />
            </div>
            <div className="fk-modal__footer">
              <button className="builder-toolbar-btn" onClick={() => setFkPickerState(null)}>Cancel</button>
              <button className="builder-toolbar-btn builder-toolbar-btn--active" onClick={handleSaveFKPath}>
                Save Path
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
