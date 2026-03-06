import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { FieldDef, FieldType } from '../utils/field-types';
import { inferFieldType } from '../utils/field-inference';
import { useAuth } from './AuthContext';
import { fetchTables as apiFetchTables, fetchFields as apiFetchFields } from '../services/data/api';

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
  fieldErrorsByTable: Record<string, string>;
  loading: boolean;
  error: string | null;
}

interface SchemaContextValue extends SchemaState {
  loadTables: () => Promise<void>;
  loadFieldsForTable: (tableId: string) => Promise<void>;
  getTable: (tableId: string) => TableInfo | undefined;
  getFields: (tableId: string) => FieldDef[];
  getFieldError: (tableId: string) => string | undefined;
  getField: (tableId: string, fieldId: string) => FieldDef | undefined;
  getFieldByName: (tableId: string, fieldName: string) => FieldDef | undefined;
  getPrimaryField: (tableId: string) => FieldDef | undefined;
  getEditableFields: (tableId: string) => FieldDef[];
  inferFieldsFromRecords: (tableId: string, records: Array<{ fields: Record<string, any> }>) => void;
  updateField: (tableId: string, fieldId: string, updates: Partial<FieldDef>) => void;
  addField: (tableId: string, field: FieldDef) => void;
  removeField: (tableId: string, fieldId: string) => void;
}

const SchemaContext = createContext<SchemaContextValue | null>(null);

export function SchemaProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;

  const [state, setState] = useState<SchemaState>({
    tables: [],
    fieldsByTable: {},
    fieldErrorsByTable: {},
    loading: false,
    error: null,
  });

  // Track in-flight field requests to prevent duplicate concurrent fetches
  const fieldRequestsRef = useRef<Record<string, Promise<void>>>({});

  const loadTables = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const rawTables = await apiFetchTables(token);
      const tables: TableInfo[] = (Array.isArray(rawTables) ? rawTables : []).map((t: any) => ({
        tableId: t.table_id || t.tableId,
        tableName: t.table_name || t.tableName || t.table_id || '',
        matrixRoomId: t.matrix_room_id || t.matrixRoomId,
        primaryField: t.primary_field || t.primaryField,
        fieldCount: t.field_count || t.fieldCount || t.record_count || t.recordCount,
      }));
      setState(s => ({ ...s, tables, loading: false }));
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const loadFieldsForTable = useCallback(async (tableId: string) => {
    const token = tokenRef.current;
    if (!token) return;

    // Deduplicate: if there's already an in-flight request for this table, await it
    if (fieldRequestsRef.current[tableId]) {
      return fieldRequestsRef.current[tableId];
    }

    const doLoad = async () => {
      // Clear previous error for this table
      setState(s => ({
        ...s,
        fieldErrorsByTable: { ...s.fieldErrorsByTable, [tableId]: undefined as any },
      }));
      try {
        const data = await apiFetchFields(tableId, token);
        const rawFields = Array.isArray(data) ? data : data.fields || [];
        const fields: FieldDef[] = rawFields.map((f: any) => ({
          fieldId: f.field_id || f.fieldId,
          tableId: f.table_id || f.tableId || tableId,
          fieldName: f.field_name || f.fieldName || '',
          fieldType: (f.field_type || f.fieldType || 'singleLineText') as FieldType,
          isComputed: f.is_computed ?? f.isComputed ?? false,
          isExcluded: f.is_excluded ?? f.isExcluded ?? false,
          options: f.options || {},
        }));
        setState(s => {
          const { [tableId]: _, ...restErrors } = s.fieldErrorsByTable;
          return {
            ...s,
            fieldsByTable: { ...s.fieldsByTable, [tableId]: fields },
            fieldErrorsByTable: restErrors,
          };
        });
      } catch (err: any) {
        const message = err.message?.includes('<!DOCTYPE')
          ? 'Server error: the fields endpoint returned an unexpected response. Please try again.'
          : err.message || 'Failed to load fields';
        console.error(`Failed to load fields for table ${tableId}:`, err);
        setState(s => ({
          ...s,
          fieldErrorsByTable: { ...s.fieldErrorsByTable, [tableId]: message },
        }));
      } finally {
        delete fieldRequestsRef.current[tableId];
      }
    };

    fieldRequestsRef.current[tableId] = doLoad();
    return fieldRequestsRef.current[tableId];
  }, []);

  const getTable = useCallback((tableId: string) => {
    return state.tables.find(t => t.tableId === tableId);
  }, [state.tables]);

  const getFields = useCallback((tableId: string) => {
    return state.fieldsByTable[tableId] || [];
  }, [state.fieldsByTable]);

  const getFieldError = useCallback((tableId: string) => {
    return state.fieldErrorsByTable[tableId];
  }, [state.fieldErrorsByTable]);

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

  const inferFieldsFromRecords = useCallback((tableId: string, records: Array<{ fields: Record<string, any> }>) => {
    // Only infer if we don't already have fields for this table
    setState(s => {
      if (s.fieldsByTable[tableId]?.length > 0) return s;
      if (records.length === 0) return s;

      // Collect all unique field names across records
      const fieldNames = new Set<string>();
      for (const r of records) {
        if (r.fields) {
          for (const key of Object.keys(r.fields)) {
            fieldNames.add(key);
          }
        }
      }

      // Sample values to infer types
      const fields: FieldDef[] = Array.from(fieldNames).map(name => {
        // Find first non-null value for type inference
        let sampleValue: any = null;
        for (const r of records) {
          if (r.fields[name] != null) {
            sampleValue = r.fields[name];
            break;
          }
        }

        return {
          fieldId: `fld_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
          tableId,
          fieldName: name,
          fieldType: inferFieldType(name, sampleValue),
          isComputed: false,
          isExcluded: false,
          options: {},
        };
      });

      return {
        ...s,
        fieldsByTable: { ...s.fieldsByTable, [tableId]: fields },
      };
    });
  }, []);

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
      getFieldError,
      getField,
      getFieldByName,
      getPrimaryField,
      getEditableFields,
      inferFieldsFromRecords,
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
