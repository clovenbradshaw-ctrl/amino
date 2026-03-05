// =============================================================================
// Amino Data Layer — TypeScript Type Definitions
//
// Canonical types used across the data layer: records, tables, field operations,
// sync events, hydration tiers, and mutation tracking.
// =============================================================================

/** A single Amino record (mirrors an Airtable row). */
export interface AminoRecord {
  /** Airtable record ID (e.g. "recXXXXXXXXXXXXXX"). */
  id: string;
  /** Table this record belongs to (e.g. "tblXXXXXXXXXXXXXX"). */
  tableId: string;
  /** Human-readable table name (for display). */
  tableName: string;
  /** Field name → field value map. Values can be any JSON-serialisable type. */
  fields: Record<string, any>;
  /** ISO timestamp of last successful sync from server. */
  lastSynced: string;
  /** Optional per-field metadata (e.g. field type hints from Airtable schema). */
  _fieldMetadata?: Record<string, FieldMetadata>;
}

/** Metadata about a single field (attached to records when available). */
export interface FieldMetadata {
  type?: string;
  name?: string;
  options?: Record<string, any>;
}

/** Table metadata as returned by /amino-tables. */
export interface AminoTable {
  /** Airtable table ID. */
  table_id: string;
  /** Human-readable table name. */
  table_name: string;
  /** Matrix room ID for this table (if mapped). */
  matrixRoomId?: string;
  /** Name of the primary field (first column). */
  primaryField?: string;
  /** Total number of fields in the table schema. */
  fieldCount?: number;
  /** Approximate record count (from API metadata). */
  record_count?: number;
}

// =============================================================================
// EO (Event Operations) — Field-level mutation format
//
// Three operation types form the canonical mutation language:
//   ALT — Alter (overwrite) existing field values
//   INS — Insert new field values
//   NUL — Nullify (delete) fields
//
// Applied in strict order: ALT -> INS -> NUL
// =============================================================================

/** Canonical field operations object. */
export interface FieldOps {
  /** Fields to overwrite (alter). Key = field name, value = new value. */
  ALT?: Record<string, any>;
  /** Fields to insert (new). Key = field name, value = value. */
  INS?: Record<string, any>;
  /** Fields to delete (nullify). Array of field names. */
  NUL?: string[];
}

// =============================================================================
// Field History — Per-field change tracking
// =============================================================================

/** A single entry in a field's change history. */
export interface FieldHistoryEntry {
  /** The value at this point in history. */
  value: any;
  /** ISO timestamp of the change. */
  timestamp: string;
  /** Who made the change (Matrix user ID). */
  sender?: string;
  /** Matrix event ID that carried this change. */
  eventId?: string;
  /** The operation type that produced this change. */
  op: 'ALT' | 'INS' | 'NUL';
}

// =============================================================================
// Sync Events — Events emitted during sync/hydration
// =============================================================================

/** Custom event detail emitted as amino:sync. */
export interface SyncEvent {
  /** Which table was updated. */
  tableId?: string;
  /** How many records changed in this sync cycle. */
  updatedCount: number;
  /** Source of the sync (e.g. 'http-poll', 'matrix-view-sync'). */
  source?: string;
}

/** Progress callback detail during hydration. */
export interface HydrationProgress {
  /** Table currently being hydrated. */
  tableId: string;
  /** Human-readable table name. */
  tableName: string;
  /** Zero-based index of this table in the hydration sequence. */
  tableIndex: number;
  /** Total number of tables to hydrate. */
  tableCount: number;
  /** Number of records hydrated for this table. */
  recordCount: number;
  /** Running total of records hydrated so far. */
  totalRecords: number;
}

// =============================================================================
// Hydration Tiers
// =============================================================================

/**
 * Available hydration tiers, tried in order.
 *
 * - 'postgres'       Per-table fetch via /amino-records webhook
 * - 'bulk-download'  Single request for all tables (Box snapshot)
 * - 'csv'            Parse a local CSV file
 * - 'url'            Fetch from an arbitrary URL
 */
export type HydrationTier = 'postgres' | 'bulk-download' | 'csv' | 'url';

/** Result returned by a hydration run. */
export interface HydrationResult {
  success: boolean;
  totalRecords: number;
  totalTables: number;
  tier: HydrationTier | null;
  /** Table IDs that had records after hydration. */
  hydratedTables?: string[];
  /** Table IDs that were empty after hydration. */
  emptyTables?: string[];
}

// =============================================================================
// Hydration Configuration
// =============================================================================

/** Table ordering strategies for hydration. */
export type TableOrderStrategy = 'api-order' | 'priority' | 'smallest' | 'largest';

export interface HydrationConfig {
  BATCH_SIZE: number;
  POLL_INTERVAL_MS: number;
  MATRIX_SYNC_TIMEOUT_MS: number;
  MATRIX_SYNC_EVENT_LIMIT: number;
  MAX_CONSECUTIVE_SYNC_ERRORS: number;
  MAX_TABLE_POLL_FAILURES: number;
  PROCESSED_EVENT_TTL_MS: number;
  MAX_PROCESSED_EVENTS: number;
  OPTIMISTIC_WRITE_TTL_MS: number;
  TIER_ORDER: HydrationTier[];
  TABLE_ORDER: TableOrderStrategy;
  TABLE_PRIORITY: string[];
  PARALLEL_TABLES: boolean;
  PARALLEL_TABLE_CONCURRENCY: number;
}

// =============================================================================
// Record Mutations — Offline write queue
// =============================================================================

/** A queued mutation created while offline. */
export interface RecordMutation {
  /** Unique mutation ID (e.g. "mut_1234567890_abc123"). */
  id: string;
  /** Table the mutation targets. */
  tableId: string;
  /** Record the mutation targets. */
  recordId: string;
  /** Operation type. */
  op: 'ALT' | 'INS' | 'NUL';
  /** Field changes. */
  fields: Record<string, any>;
  /** Unix timestamp (ms) when the mutation was created. */
  timestamp: number;
  /** Current status in the queue. */
  status: 'pending' | 'in-flight' | 'failed' | 'completed';
  /** Number of times flush has been attempted. */
  retryCount?: number;
  /** Error message from last failed attempt. */
  lastError?: string;
}

// =============================================================================
// Sync State / Version Cursors
// =============================================================================

/** Per-table sync cursor stored in IndexedDB. */
export interface SyncCursor {
  tableId: string;
  /** ISO timestamp of the last successful sync. */
  lastSynced: string;
  /** Where the cursor value came from. */
  cursorSource: 'server-next-since' | 'server-record-max' | 'client-clock-fallback' | 'csv-import' | 'url-import' | 'unknown';
  /** ISO timestamp of when this cursor was written. */
  updatedAt: string;
}

/** Resolved cursor from an API response. */
export interface ResolvedCursor {
  value: string;
  source: SyncCursor['cursorSource'];
}

// =============================================================================
// IDB Entry — What gets stored in IndexedDB (encrypted fields)
// =============================================================================

/** An IndexedDB record entry. Fields are either encrypted (ArrayBuffer) or plaintext JSON string. */
export interface IDBRecordEntry {
  id: string;
  tableId: string;
  tableName: string;
  /** Encrypted ArrayBuffer or plaintext JSON string (deferred encryption mode). */
  fields: ArrayBuffer | string;
  lastSynced: string;
}

// =============================================================================
// API Response Types
// =============================================================================

/** Response from /amino-tables. */
export interface TablesResponse {
  tables: AminoTable[];
}

/** Response from /amino-records and /amino-records-since. */
export interface RecordsResponse {
  records: Array<{
    id: string;
    tableId?: string;
    table_id?: string;
    tableName?: string;
    table_name?: string;
    fields: Record<string, any> | string;
    lastSynced?: string;
    last_synced?: string;
  }>;
  /** Server-provided cursor for incremental sync. */
  next_since?: string;
  /** Server clock at response time. */
  server_time?: string;
  serverTime?: string;
}

// =============================================================================
// Event Log API Response Types
// =============================================================================

/** A single event from the amino.event_log table. */
export interface AminoEvent {
  id: number;
  recordId: string;
  createdAt: string;
  operator: string;
  payload: any;
  uuid: string;
  set: string;
}

/** Response from /amino-events-set. */
export interface EventsSetResponse {
  set: string;
  count: number;
  events: AminoEvent[];
}

/** Response from /amino-events-since. */
export interface EventsSinceResponse {
  since: string;
  count: number;
  events: AminoEvent[];
}

/** Response from /amino-events-record. */
export interface EventsRecordResponse {
  recordId: string;
  count: number;
  events: AminoEvent[];
}

/** Response from /amino-record (single record with full details). */
export interface SingleRecordResponse {
  record?: {
    id: string;
    tableId: string;
    tableName: string;
    fields: Record<string, any> | string;
    matrixRoomId: string;
    lastSynced: string;
    eventCount: number;
  };
  error?: string;
}

// =============================================================================
// Event Content — Wire format for Matrix EO events
// =============================================================================

/** Structured EO event content (payload wrapper). */
export interface EOEventContent {
  payload?: {
    fields?: FieldOps | Record<string, any>;
  };
  /** Flat format fields. */
  fields?: Record<string, any> | FieldOps;
  /** Flat format operation type. */
  op?: 'ALT' | 'INS' | 'NUL';
  /** Encrypted payload marker. */
  _encrypted?: boolean;
  _ciphertext?: string;
}
