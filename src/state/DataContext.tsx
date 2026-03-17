import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { fetchRecords as apiFetchRecords } from '../services/data/api';
import type { FieldType } from '../utils/field-types';

export interface AminoRecord {
  tableId: string;
  recordId: string;
  fields: Record<string, any>;
  _fieldMetadata?: Record<string, {
    fieldId: string;
    lastUpdated: string;
    changeType: string;
  }>;
}

/** A field_definition record extracted from the data stream. */
export interface FieldDefinitionRecord {
  fieldId: string;
  tableId: string;
  fieldName: string;
  fieldType: FieldType;
  formula?: string;
  options?: Record<string, any>;
}

interface DataState {
  recordsByTable: Record<string, AminoRecord[]>;
  /** field_definition records separated from data, keyed by tableId */
  fieldDefsByTable: Record<string, FieldDefinitionRecord[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  hydrationProgress: Record<string, { loaded: number; total: number }>;
  lastSyncedAt: Record<string, string>;
}

interface DataContextValue extends DataState {
  loadRecords: (tableId: string) => Promise<void>;
  getRecords: (tableId: string) => AminoRecord[];
  getRecord: (tableId: string, recordId: string) => AminoRecord | undefined;
  getFieldDefinitions: (tableId: string) => FieldDefinitionRecord[];
  updateRecord: (tableId: string, recordId: string, fields: Record<string, any>) => void;
  addRecord: (tableId: string, record: AminoRecord) => void;
  deleteRecord: (tableId: string, recordId: string) => void;
  isLoading: (tableId: string) => boolean;
  getError: (tableId: string) => string | null;
  getLastSyncedAt: (tableId: string) => string | null;
  getLatestSyncTime: () => string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;

  const [state, setState] = useState<DataState>({
    recordsByTable: {},
    fieldDefsByTable: {},
    loading: {},
    errors: {},
    hydrationProgress: {},
    lastSyncedAt: {},
  });

  // Track in-flight requests to prevent duplicate fetches
  const inFlight = useRef<Record<string, boolean>>({});

  const loadRecords = useCallback(async (tableId: string) => {
    if (inFlight.current[tableId]) return;
    const token = tokenRef.current;
    if (!token) return;
    inFlight.current[tableId] = true;

    setState(s => ({
      ...s,
      loading: { ...s.loading, [tableId]: true },
      errors: { ...s.errors, [tableId]: null },
    }));

    try {
      const data = await apiFetchRecords(tableId, token);

      // Normalize records — handle different response shapes
      let rawRecords: any[] = [];
      if (Array.isArray(data)) {
        rawRecords = data;
      } else if (data.records) {
        rawRecords = data.records;
      } else if (data.items) {
        rawRecords = data.items;
      }

      const allParsed: AminoRecord[] = rawRecords.map((r: any) => {
        let fields = r.fields || r;
        // Parse JSON string fields (PostgreSQL JSON columns may arrive as strings)
        if (typeof fields === 'string') {
          try { fields = JSON.parse(fields); } catch { fields = {}; }
        }
        return {
          tableId,
          recordId: r.record_id || r.recordId || r.id || '',
          fields,
          _fieldMetadata: r._fieldMetadata,
        };
      });

      // Partition: separate field_definition records from data records.
      // field_definition records have _set === "field_definition" and describe
      // schema (fieldId, fieldName, fieldType, formula, etc.) rather than data.
      const records: AminoRecord[] = [];
      const fieldDefs: FieldDefinitionRecord[] = [];
      for (const rec of allParsed) {
        if (rec.fields._set === 'field_definition' && rec.fields.fieldId) {
          fieldDefs.push({
            fieldId: rec.fields.fieldId,
            tableId: rec.fields.tableId || tableId,
            fieldName: rec.fields.fieldName || rec.fields.name || rec.fields.fieldId,
            fieldType: (rec.fields.fieldType || rec.fields.type || 'singleLineText') as FieldType,
            formula: rec.fields.formula || undefined,
            options: rec.fields.options || {},
          });
        } else {
          records.push(rec);
        }
      }

      setState(s => ({
        ...s,
        recordsByTable: { ...s.recordsByTable, [tableId]: records },
        fieldDefsByTable: {
          ...s.fieldDefsByTable,
          ...(fieldDefs.length > 0 ? { [tableId]: fieldDefs } : {}),
        },
        loading: { ...s.loading, [tableId]: false },
        lastSyncedAt: { ...s.lastSyncedAt, [tableId]: new Date().toISOString() },
      }));
    } catch (err: any) {
      setState(s => ({
        ...s,
        loading: { ...s.loading, [tableId]: false },
        errors: { ...s.errors, [tableId]: err.message },
      }));
    } finally {
      inFlight.current[tableId] = false;
    }
  }, []);

  const getRecords = useCallback((tableId: string) => {
    return state.recordsByTable[tableId] || [];
  }, [state.recordsByTable]);

  const getFieldDefinitions = useCallback((tableId: string) => {
    return state.fieldDefsByTable[tableId] || [];
  }, [state.fieldDefsByTable]);

  const getRecord = useCallback((tableId: string, recordId: string) => {
    return getRecords(tableId).find(r => r.recordId === recordId);
  }, [getRecords]);

  const updateRecord = useCallback((tableId: string, recordId: string, fields: Record<string, any>) => {
    setState(s => ({
      ...s,
      recordsByTable: {
        ...s.recordsByTable,
        [tableId]: (s.recordsByTable[tableId] || []).map(r =>
          r.recordId === recordId ? { ...r, fields: { ...r.fields, ...fields } } : r
        ),
      },
    }));
  }, []);

  const addRecord = useCallback((tableId: string, record: AminoRecord) => {
    setState(s => ({
      ...s,
      recordsByTable: {
        ...s.recordsByTable,
        [tableId]: [...(s.recordsByTable[tableId] || []), record],
      },
    }));
  }, []);

  const deleteRecord = useCallback((tableId: string, recordId: string) => {
    setState(s => ({
      ...s,
      recordsByTable: {
        ...s.recordsByTable,
        [tableId]: (s.recordsByTable[tableId] || []).filter(r => r.recordId !== recordId),
      },
    }));
  }, []);

  const isLoading = useCallback((tableId: string) => {
    return state.loading[tableId] || false;
  }, [state.loading]);

  const getError = useCallback((tableId: string) => {
    return state.errors[tableId] || null;
  }, [state.errors]);

  const getLastSyncedAt = useCallback((tableId: string) => {
    return state.lastSyncedAt[tableId] || null;
  }, [state.lastSyncedAt]);

  const getLatestSyncTime = useCallback(() => {
    const times = Object.values(state.lastSyncedAt);
    if (times.length === 0) return null;
    return times.reduce((latest, t) => (t > latest ? t : latest));
  }, [state.lastSyncedAt]);

  return (
    <DataContext.Provider value={{
      ...state,
      loadRecords,
      getRecords,
      getRecord,
      getFieldDefinitions,
      updateRecord,
      addRecord,
      deleteRecord,
      isLoading,
      getError,
      getLastSyncedAt,
      getLatestSyncTime,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
