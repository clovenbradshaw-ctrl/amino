import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { fetchRecords as apiFetchRecords } from '../services/data/api';

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

interface DataState {
  recordsByTable: Record<string, AminoRecord[]>;
  loading: Record<string, boolean>;
  errors: Record<string, string | null>;
  hydrationProgress: Record<string, { loaded: number; total: number }>;
}

interface DataContextValue extends DataState {
  loadRecords: (tableId: string) => Promise<void>;
  getRecords: (tableId: string) => AminoRecord[];
  getRecord: (tableId: string, recordId: string) => AminoRecord | undefined;
  updateRecord: (tableId: string, recordId: string, fields: Record<string, any>) => void;
  addRecord: (tableId: string, record: AminoRecord) => void;
  deleteRecord: (tableId: string, recordId: string) => void;
  isLoading: (tableId: string) => boolean;
  getError: (tableId: string) => string | null;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;

  const [state, setState] = useState<DataState>({
    recordsByTable: {},
    loading: {},
    errors: {},
    hydrationProgress: {},
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

      const records: AminoRecord[] = rawRecords.map((r: any) => ({
        tableId,
        recordId: r.record_id || r.recordId || r.id || '',
        fields: r.fields || r,
        _fieldMetadata: r._fieldMetadata,
      }));

      setState(s => ({
        ...s,
        recordsByTable: { ...s.recordsByTable, [tableId]: records },
        loading: { ...s.loading, [tableId]: false },
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

  return (
    <DataContext.Provider value={{
      ...state,
      loadRecords,
      getRecords,
      getRecord,
      updateRecord,
      addRecord,
      deleteRecord,
      isLoading,
      getError,
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
