import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useEmittedOps } from './EmittedOpsContext';
import { fetchRecords as apiFetchRecords } from '../services/data/api';
import {
  getRecordsByTable as idbGetRecordsByTable,
  putRecordsBatch,
  deleteTableRecords,
  putSyncCursor,
  getSyncCursor,
} from '../services/data/idb-store';
import type { AminoRecord as IDBRecord } from '../services/data/types';
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
  const { session, cryptoKey, dbReady } = useAuth();
  const { emit } = useEmittedOps();
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;
  const cryptoKeyRef = useRef(cryptoKey);
  cryptoKeyRef.current = cryptoKey;
  const dbReadyRef = useRef(dbReady);
  dbReadyRef.current = dbReady;

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
  // Track tables that have been loaded from cache (so we know to do background refresh)
  const loadedFromCache = useRef<Set<string>>(new Set());

  /**
   * Parse raw API records into AminoRecord[] and FieldDefinitionRecord[].
   */
  const parseRawRecords = useCallback((rawRecords: any[], tableId: string) => {
    const allParsed: AminoRecord[] = rawRecords.map((r: any) => {
      let fields = r.fields || r;
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
    return { records, fieldDefs };
  }, []);

  /**
   * Write records to IDB for local caching (deferred encryption).
   */
  const writeToIDB = useCallback(async (records: AminoRecord[], tableId: string) => {
    if (!dbReadyRef.current) return;
    try {
      const idbRecords: IDBRecord[] = records.map(r => ({
        id: r.recordId,
        tableId,
        tableName: tableId,
        fields: r.fields,
        lastSynced: new Date().toISOString(),
      }));
      await putRecordsBatch(idbRecords, cryptoKeyRef.current, true /* deferEncryption */);
      await putSyncCursor({
        tableId,
        lastSynced: new Date().toISOString(),
        cursorSource: 'server-record-max',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[Data] Failed to write records to IDB:', err);
    }
  }, []);

  /**
   * Try to load records from IDB cache. Returns null if no cached data.
   */
  const loadFromIDB = useCallback(async (tableId: string): Promise<AminoRecord[] | null> => {
    if (!dbReadyRef.current) return null;
    try {
      const cached = await idbGetRecordsByTable(tableId, cryptoKeyRef.current);
      if (!cached || cached.length === 0) return null;
      // Convert IDB records to DataContext AminoRecord format
      return cached.map(r => ({
        tableId,
        recordId: r.id,
        fields: r.fields,
      }));
    } catch (err) {
      console.warn('[Data] Failed to load records from IDB:', err);
      return null;
    }
  }, []);

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

    // 1. Try loading from local IDB cache first (instant)
    const cachedRecords = await loadFromIDB(tableId);
    if (cachedRecords && cachedRecords.length > 0) {
      const { records: cached, fieldDefs: cachedFieldDefs } = parseRawRecords(
        cachedRecords.map(r => ({ id: r.recordId, fields: r.fields })),
        tableId,
      );
      setState(s => ({
        ...s,
        recordsByTable: { ...s.recordsByTable, [tableId]: cached },
        fieldDefsByTable: {
          ...s.fieldDefsByTable,
          ...(cachedFieldDefs.length > 0 ? { [tableId]: cachedFieldDefs } : {}),
        },
        loading: { ...s.loading, [tableId]: false },
      }));
      loadedFromCache.current.add(tableId);
      console.log(`[Data] Loaded ${cached.length} cached records for ${tableId}`);
    }

    // 2. Fetch from API (background refresh if we had cache, or primary load)
    try {
      const data = await apiFetchRecords(tableId, token);

      let rawRecords: any[] = [];
      if (Array.isArray(data)) {
        rawRecords = data;
      } else if (data.records) {
        rawRecords = data.records;
      } else if (data.items) {
        rawRecords = data.items;
      }

      const { records, fieldDefs } = parseRawRecords(rawRecords, tableId);

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

      // 3. Write fresh records to IDB for next load
      writeToIDB(records, tableId);

      emit({
        operator: 'SYNC',
        source: 'sync',
        set: tableId,
        recordId: '',
        payload: { recordCount: records.length },
        description: `Synced ${records.length} record(s) for table ${tableId}`,
      });
    } catch (err: any) {
      // If we already loaded from cache, don't show error — we have data
      if (loadedFromCache.current.has(tableId)) {
        console.warn(`[Data] API fetch failed for ${tableId} but using cached data:`, err.message);
        setState(s => ({
          ...s,
          loading: { ...s.loading, [tableId]: false },
        }));
      } else {
        setState(s => ({
          ...s,
          loading: { ...s.loading, [tableId]: false },
          errors: { ...s.errors, [tableId]: err.message },
        }));
      }
    } finally {
      inFlight.current[tableId] = false;
    }
  }, [parseRawRecords, loadFromIDB, writeToIDB, emit]);

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
    emit({
      operator: 'ALT',
      source: 'data',
      set: tableId,
      recordId,
      payload: { ALT: fields },
      description: `Updated ${Object.keys(fields).length} field(s) on ${recordId}`,
    });
  }, [emit]);

  const addRecord = useCallback((tableId: string, record: AminoRecord) => {
    setState(s => ({
      ...s,
      recordsByTable: {
        ...s.recordsByTable,
        [tableId]: [...(s.recordsByTable[tableId] || []), record],
      },
    }));
    emit({
      operator: 'INS',
      source: 'data',
      set: tableId,
      recordId: record.recordId,
      payload: { INS: record.fields },
      description: `Created record ${record.recordId}`,
    });
  }, [emit]);

  const deleteRecord = useCallback((tableId: string, recordId: string) => {
    setState(s => ({
      ...s,
      recordsByTable: {
        ...s.recordsByTable,
        [tableId]: (s.recordsByTable[tableId] || []).filter(r => r.recordId !== recordId),
      },
    }));
    emit({
      operator: 'NUL',
      source: 'data',
      set: tableId,
      recordId,
      payload: { NUL: [recordId] },
      description: `Deleted record ${recordId}`,
    });
  }, [emit]);

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
