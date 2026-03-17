import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { on, off } from '../services/matrix/sync';
import type { AminoEvent } from '../services/data/types';

// ============================================================================
// Emitted Operations Context
//
// Central event bus that captures ALL operations happening in the app:
//   - Data mutations (record create / update / delete)
//   - Schema changes (field add / update / remove)
//   - Interface changes (page / block CRUD)
//   - Matrix sync events (record-updated, schema-changed, etc.)
//   - Sync lifecycle events (hydration, incremental sync)
//
// The EoNotationHistory page merges these local ops with DB events.
// ============================================================================

export type OpSource = 'data' | 'schema' | 'interface' | 'matrix' | 'sync';

export interface EmittedOp {
  /** Auto-incrementing local ID (negative to distinguish from DB event IDs). */
  id: number;
  /** ISO timestamp. */
  createdAt: string;
  /** EO operator. */
  operator: 'ALT' | 'INS' | 'NUL' | 'SYNC' | 'INFO';
  /** Source subsystem. */
  source: OpSource;
  /** Table ID, page ID, or context label. */
  set: string;
  /** Record / resource ID. */
  recordId: string;
  /** Mutation payload (field changes, etc). */
  payload: any;
  /** Human-readable description. */
  description: string;
  /** Unique ID for dedup. */
  uuid: string;
}

interface EmittedOpsContextValue {
  /** All locally-tracked operations (most recent first). */
  ops: EmittedOp[];
  /** Emit a new operation. */
  emit: (op: Omit<EmittedOp, 'id' | 'createdAt' | 'uuid'>) => void;
  /** Clear local ops. */
  clear: () => void;
}

const EmittedOpsContext = createContext<EmittedOpsContextValue | null>(null);

const MAX_LOCAL_OPS = 2000;

let _nextId = -1;

function makeUuid(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function EmittedOpsProvider({ children }: { children: React.ReactNode }) {
  const [ops, setOps] = useState<EmittedOp[]>([]);
  const opsRef = useRef(ops);
  opsRef.current = ops;

  const emit = useCallback((partial: Omit<EmittedOp, 'id' | 'createdAt' | 'uuid'>) => {
    const op: EmittedOp = {
      ...partial,
      id: _nextId--,
      createdAt: new Date().toISOString(),
      uuid: makeUuid(),
    };
    setOps(prev => {
      const next = [op, ...prev];
      return next.length > MAX_LOCAL_OPS ? next.slice(0, MAX_LOCAL_OPS) : next;
    });
  }, []);

  const clear = useCallback(() => setOps([]), []);

  // ---------- Matrix sync event listener ----------
  useEffect(() => {
    const handleRecordUpdated = (data: any) => {
      const event = data?.event;
      if (!event) return;
      const content = event.content || {};
      const op = content.op?.toUpperCase?.() || 'ALT';
      emit({
        operator: op === 'INS' || op === 'INSERT' ? 'INS'
          : op === 'NUL' || op === 'DELETE' ? 'NUL'
          : 'ALT',
        source: 'matrix',
        set: content.tableId || content.table_id || data.roomId || '',
        recordId: content.recordId || content.record_id || '',
        payload: content,
        description: `Matrix: record ${op.toLowerCase()} in ${data.roomId || 'unknown room'}`,
      });
    };

    const handleSchemaChanged = (data: any) => {
      const event = data?.event;
      if (!event) return;
      emit({
        operator: 'ALT',
        source: 'matrix',
        set: event.content?.tableId || event.content?.table_id || '',
        recordId: '',
        payload: event.content,
        description: `Matrix: schema changed (${event.type})`,
      });
    };

    const handleSyncComplete = () => {
      emit({
        operator: 'SYNC',
        source: 'sync',
        set: '',
        recordId: '',
        payload: {},
        description: 'Matrix sync cycle completed',
      });
    };

    on('amino:record-updated', handleRecordUpdated);
    on('amino:schema-changed', handleSchemaChanged);
    on('amino:sync-complete', handleSyncComplete);

    return () => {
      off('amino:record-updated', handleRecordUpdated);
      off('amino:schema-changed', handleSchemaChanged);
      off('amino:sync-complete', handleSyncComplete);
    };
  }, [emit]);

  return (
    <EmittedOpsContext.Provider value={{ ops, emit, clear }}>
      {children}
    </EmittedOpsContext.Provider>
  );
}

export function useEmittedOps() {
  const ctx = useContext(EmittedOpsContext);
  if (!ctx) throw new Error('useEmittedOps must be used within EmittedOpsProvider');
  return ctx;
}

/** Convert an EmittedOp to an AminoEvent shape for unified display. */
export function toAminoEvent(op: EmittedOp): AminoEvent {
  return {
    id: op.id,
    recordId: op.recordId,
    createdAt: op.createdAt,
    operator: op.operator,
    payload: op.payload,
    uuid: op.uuid,
    set: op.set,
  };
}
