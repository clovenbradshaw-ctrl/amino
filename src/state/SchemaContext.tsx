import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { FieldDef, FieldType } from '../utils/field-types';
import { isComputed } from '../utils/field-types';
import { useAuth } from './AuthContext';
import { fetchTables as apiFetchTables, fetchFields as apiFetchFields, fetchRecords as apiFetchRecords } from '../services/data/api';

export interface TableInfo {
  tableId: string;
  tableName: string;
  matrixRoomId?: string;
  primaryField?: string;
  fieldCount?: number;
  recordCount?: number;
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
  deriveFieldsFromRecords: (tableId: string, records: Array<{ fields: Record<string, any> }>) => void;
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

/**
 * Infer a FieldType from a sample value.
 *
 * Heuristics are tuned against real Airtable event-stream data where:
 *   - Record link arrays contain "rec…" IDs (not free-text select options)
 *   - Button/action fields are objects with a "label" key
 *   - Rollup/lookup results may be arrays of non-string primitives
 *   - Computed fields may produce {"specialValue":"NaN"} sentinel objects
 */
function inferFieldType(value: any): FieldType {
  if (value == null) return 'singleLineText';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';

  // Arrays — distinguish record links from selects and lookup values
  if (Array.isArray(value)) {
    if (value.length === 0) return 'multipleSelects';
    const first = value[0];
    // Array of objects (record links, rollup results, or specialValue sentinels)
    if (typeof first === 'object' && first !== null) return 'multipleRecordLinks';
    // Array of strings — check for Airtable record ID pattern (rec + 14-17 alphanum chars)
    if (typeof first === 'string') {
      if (/^rec[A-Za-z0-9]{10,}$/.test(first)) return 'multipleRecordLinks';
      return 'multipleSelects';
    }
    // Array of booleans/numbers = lookup values
    return 'multipleLookupValues';
  }

  // Objects — button fields have {label: "..."}, computed results may have {specialValue: ...}
  if (typeof value === 'object' && value !== null) {
    if ('label' in value) return 'button';
    if ('specialValue' in value) return 'formula';
    return 'singleLineText';
  }

  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'dateTime';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
    if (/^https?:\/\//.test(value)) return 'url';
    if (/@/.test(value) && /\./.test(value)) return 'email';
    if (value.includes('\n')) return 'multilineText';
  }
  return 'singleLineText';
}

export function SchemaProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const tokenRef = useRef(session?.accessToken);
  tokenRef.current = session?.accessToken;

  const [state, setState] = useState<SchemaState>({
    tables: [],
    fieldsByTable: {},
    loading: false,
    error: null,
  });

  const loadTables = useCallback(async () => {
    const token = tokenRef.current;
    if (!token) return;
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const rawTables = await apiFetchTables(token);
      const mapped: TableInfo[] = (Array.isArray(rawTables) ? rawTables : []).map((t: any) => ({
        tableId: t.table_id || t.tableId,
        tableName: t.table_name || t.tableName || t.table_id || '',
        matrixRoomId: t.matrix_room_id || t.matrixRoomId,
        primaryField: t.primary_field || t.primaryField,
        fieldCount: t.field_count || t.fieldCount,
        recordCount: t.record_count || t.recordCount,
      }));
      // Deduplicate tables by tableId first, then by tableName,
      // keeping the entry with the most records in each case
      const byId = new Map<string, TableInfo>();
      for (const t of mapped) {
        const existing = byId.get(t.tableId);
        if (!existing || (t.recordCount ?? 0) > (existing.recordCount ?? 0)) {
          byId.set(t.tableId, t);
        }
      }
      const byName = new Map<string, TableInfo>();
      for (const t of byId.values()) {
        const existing = byName.get(t.tableName);
        if (!existing || (t.recordCount ?? 0) > (existing.recordCount ?? 0)) {
          byName.set(t.tableName, t);
        }
      }
      const tables = Array.from(byName.values());
      setState(s => ({ ...s, tables, loading: false }));
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const loadFieldsForTable = useCallback(async (tableId: string) => {
    const token = tokenRef.current;
    if (!token) return;
    try {
      const data = await apiFetchFields(tableId, token);
      const rawFields = Array.isArray(data) ? data : data.fields || [];
      const fields: FieldDef[] = rawFields.map((f: any) => ({
        fieldId: f.field_id || f.fieldId,
        tableId: f.table_id || f.tableId || tableId,
        fieldName: f.field_name || f.fieldName || '',
        fieldType: (f.field_type || f.fieldType || 'singleLineText') as FieldType,
        isComputed: f.is_computed ?? f.isComputed ?? false,
        isExcluded: false,  // show all fields by default
        options: f.options || {},
      }));

      if (fields.length > 0) {
        setState(s => ({
          ...s,
          fieldsByTable: { ...s.fieldsByTable, [tableId]: fields },
        }));
        return;
      }

      // No field metadata returned — derive fields from actual records
      const recordsData = await apiFetchRecords(tableId, token);
      const records = Array.isArray(recordsData) ? recordsData : recordsData.records || [];
      if (records.length > 0) {
        // Build fields inline (same logic as deriveFieldsFromRecords but
        // without the early-return guard so it always applies here)
        const fieldNames = new Set<string>();
        const sampleValues = new Map<string, any>();
        for (const record of records) {
          let recFields = record.fields;
          if (typeof recFields === 'string') {
            try { recFields = JSON.parse(recFields); } catch { continue; }
          }
          if (!recFields || typeof recFields !== 'object') continue;
          for (const [key, value] of Object.entries(recFields)) {
            fieldNames.add(key);
            if (!sampleValues.has(key) && value != null) sampleValues.set(key, value);
          }
        }
        const derived: FieldDef[] = Array.from(fieldNames).map((name, i) => {
          const fieldType = inferFieldType(sampleValues.get(name));
          return {
            fieldId: `fld_${tableId.slice(0, 8)}_${i}`,
            tableId,
            fieldName: name,
            fieldType,
            isComputed: isComputed(fieldType),
            isExcluded: false,
            options: {},
          };
        });
        if (derived.length > 0) {
          setState(s => ({
            ...s,
            fieldsByTable: { ...s.fieldsByTable, [tableId]: derived },
          }));
        }
      }
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

  const deriveFieldsFromRecords = useCallback((tableId: string, records: Array<{ fields: Record<string, any> }>) => {
    // Only derive if we don't already have fields for this table
    if (state.fieldsByTable[tableId]?.length > 0) return;

    const fieldNames = new Set<string>();
    const sampleValues = new Map<string, any>();

    // Scan ALL records so no fields are missed
    for (const record of records) {
      let fields = record.fields;
      if (typeof fields === 'string') {
        try { fields = JSON.parse(fields); } catch { continue; }
      }
      if (!fields || typeof fields !== 'object') continue;
      for (const [key, value] of Object.entries(fields)) {
        fieldNames.add(key);
        if (!sampleValues.has(key) && value != null) sampleValues.set(key, value);
      }
    }

    const fields: FieldDef[] = Array.from(fieldNames).map((name, i) => {
      const fieldType = inferFieldType(sampleValues.get(name));
      return {
        fieldId: `fld_${tableId.slice(0, 8)}_${i}`,
        tableId,
        fieldName: name,
        fieldType,
        isComputed: isComputed(fieldType),
        isExcluded: false,
        options: {},
      };
    });

    if (fields.length > 0) {
      setState(s => ({
        ...s,
        fieldsByTable: { ...s.fieldsByTable, [tableId]: fields },
      }));
    }
  }, [state.fieldsByTable]);

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
      deriveFieldsFromRecords,
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
