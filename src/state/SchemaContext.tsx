import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { FieldDef, FieldType } from '../utils/field-types';

export interface TableInfo {
  tableId: string;
  tableName: string;
  matrixRoomId?: string;
  primaryField?: string;
  fieldCount?: number;
}

interface SchemaState {
  tables: TableInfo[];
  fieldsByTable: Record<string, FieldDef[]>;
  loading: boolean;
  error: string | null;
}

interface SchemaContextValue extends SchemaState {
  loadTables: () => Promise<void>;
  loadFieldsForTable: (tableId: string) => Promise<void>;
  getTable: (tableId: string) => TableInfo | undefined;
  getFields: (tableId: string) => FieldDef[];
  getField: (tableId: string, fieldId: string) => FieldDef | undefined;
  getFieldByName: (tableId: string, fieldName: string) => FieldDef | undefined;
  getPrimaryField: (tableId: string) => FieldDef | undefined;
  getEditableFields: (tableId: string) => FieldDef[];
  updateField: (tableId: string, fieldId: string, updates: Partial<FieldDef>) => void;
  addField: (tableId: string, field: FieldDef) => void;
  removeField: (tableId: string, fieldId: string) => void;
}

const SchemaContext = createContext<SchemaContextValue | null>(null);

const WEBHOOK_BASE = '/webhook';

export function SchemaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SchemaState>({
    tables: [],
    fieldsByTable: {},
    loading: false,
    error: null,
  });

  const loadTables = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const resp = await fetch(`${WEBHOOK_BASE}/amino-tables`);
      if (!resp.ok) throw new Error(`Failed to fetch tables: ${resp.status}`);
      const data = await resp.json();
      const tables: TableInfo[] = (Array.isArray(data) ? data : data.tables || []).map((t: any) => ({
        tableId: t.table_id || t.tableId,
        tableName: t.table_name || t.tableName || t.table_id || '',
        matrixRoomId: t.matrix_room_id || t.matrixRoomId,
        primaryField: t.primary_field || t.primaryField,
        fieldCount: t.field_count || t.fieldCount,
      }));
      setState(s => ({ ...s, tables, loading: false }));
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const loadFieldsForTable = useCallback(async (tableId: string) => {
    try {
      const resp = await fetch(`${WEBHOOK_BASE}/amino-fields?tableId=${encodeURIComponent(tableId)}`);
      if (!resp.ok) throw new Error(`Failed to fetch fields: ${resp.status}`);
      const data = await resp.json();
      const fields: FieldDef[] = (Array.isArray(data) ? data : data.fields || []).map((f: any) => ({
        fieldId: f.field_id || f.fieldId,
        tableId: f.table_id || f.tableId || tableId,
        fieldName: f.field_name || f.fieldName || '',
        fieldType: (f.field_type || f.fieldType || 'singleLineText') as FieldType,
        isComputed: f.is_computed ?? f.isComputed ?? false,
        isExcluded: f.is_excluded ?? f.isExcluded ?? false,
        options: f.options || {},
      }));
      setState(s => ({
        ...s,
        fieldsByTable: { ...s.fieldsByTable, [tableId]: fields },
      }));
    } catch (err: any) {
      console.error(`Failed to load fields for table ${tableId}:`, err);
    }
  }, []);

  const getTable = useCallback((tableId: string) => {
    return state.tables.find(t => t.tableId === tableId);
  }, [state.tables]);

  const getFields = useCallback((tableId: string) => {
    return state.fieldsByTable[tableId] || [];
  }, [state.fieldsByTable]);

  const getField = useCallback((tableId: string, fieldId: string) => {
    return getFields(tableId).find(f => f.fieldId === fieldId);
  }, [getFields]);

  const getFieldByName = useCallback((tableId: string, fieldName: string) => {
    return getFields(tableId).find(f => f.fieldName === fieldName);
  }, [getFields]);

  const getPrimaryField = useCallback((tableId: string) => {
    const table = getTable(tableId);
    if (!table?.primaryField) return getFields(tableId)[0];
    return getFields(tableId).find(f => f.fieldName === table.primaryField) || getFields(tableId)[0];
  }, [getTable, getFields]);

  const getEditableFields = useCallback((tableId: string) => {
    return getFields(tableId).filter(f => !f.isComputed && !f.isExcluded);
  }, [getFields]);

  const updateField = useCallback((tableId: string, fieldId: string, updates: Partial<FieldDef>) => {
    setState(s => ({
      ...s,
      fieldsByTable: {
        ...s.fieldsByTable,
        [tableId]: (s.fieldsByTable[tableId] || []).map(f =>
          f.fieldId === fieldId ? { ...f, ...updates } : f
        ),
      },
    }));
  }, []);

  const addField = useCallback((tableId: string, field: FieldDef) => {
    setState(s => ({
      ...s,
      fieldsByTable: {
        ...s.fieldsByTable,
        [tableId]: [...(s.fieldsByTable[tableId] || []), field],
      },
    }));
  }, []);

  const removeField = useCallback((tableId: string, fieldId: string) => {
    setState(s => ({
      ...s,
      fieldsByTable: {
        ...s.fieldsByTable,
        [tableId]: (s.fieldsByTable[tableId] || []).filter(f => f.fieldId !== fieldId),
      },
    }));
  }, []);

  return (
    <SchemaContext.Provider value={{
      ...state,
      loadTables,
      loadFieldsForTable,
      getTable,
      getFields,
      getField,
      getFieldByName,
      getPrimaryField,
      getEditableFields,
      updateField,
      addField,
      removeField,
    }}>
      {children}
    </SchemaContext.Provider>
  );
}

export function useSchema() {
  const ctx = useContext(SchemaContext);
  if (!ctx) throw new Error('useSchema must be used within SchemaProvider');
  return ctx;
}
