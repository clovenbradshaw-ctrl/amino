// =============================================================================
// Amino Hydration — Tiered Data Hydration Flow
//
// Ported from hydration.js. Orchestrates downloading record data from the
// server and writing it to IndexedDB + in-memory cache.
//
// Tier order (configurable):
//   1. postgres — Per-table fetch via /amino-records webhook (default)
//
// Features:
//   - Batch processing: 200 records per IDB write
//   - Progress event emission
//   - Table ordering strategies (api-order, priority, smallest, largest)
//   - Incremental sync via cursors (/amino-records-since)
//   - Full hydration with clear-before-write
// =============================================================================

import type {
  AminoRecord,
  AminoTable,
  HydrationConfig,
  HydrationProgress,
  HydrationResult,
  HydrationTier,
  RecordsResponse,
  ResolvedCursor,
  SyncCursor,
  TableOrderStrategy,
} from './types';
import { fetchRecords, fetchRecordsSince } from './api';
import * as idb from './idb-store';
import * as cache from './record-cache';
import * as searchIndex from './search-index';

// =============================================================================
// Configuration
// =============================================================================

const config: HydrationConfig = {
  BATCH_SIZE: 200,
  POLL_INTERVAL_MS: 15_000,
  MATRIX_SYNC_TIMEOUT_MS: 30_000,
  MATRIX_SYNC_EVENT_LIMIT: 100,
  MAX_CONSECUTIVE_SYNC_ERRORS: 10,
  MAX_TABLE_POLL_FAILURES: 5,
  PROCESSED_EVENT_TTL_MS: 300_000,   // 5 minutes
  MAX_PROCESSED_EVENTS: 5_000,
  OPTIMISTIC_WRITE_TTL_MS: 30_000,   // 30 seconds
  TIER_ORDER: ['postgres'],
  TABLE_ORDER: 'api-order',
  TABLE_PRIORITY: [],
  PARALLEL_TABLES: false,
  PARALLEL_TABLE_CONCURRENCY: 3,
};

/** Get the current hydration config (mutable). */
export function getConfig(): HydrationConfig {
  return config;
}

// =============================================================================
// Record Normalization
// =============================================================================

/** Normalize a raw API record to canonical AminoRecord form. */
function normalizeRecord(
  record: RecordsResponse['records'][0],
  tableId: string,
): AminoRecord {
  let fields = record.fields;
  if (typeof fields === 'string') {
    try {
      fields = JSON.parse(fields);
    } catch {
      fields = {};
    }
  }

  return {
    id: record.id,
    tableId: tableId || record.tableId || record.table_id || '',
    tableName: record.tableName || record.table_name || tableId || '',
    fields: (fields as Record<string, any>) || {},
    lastSynced:
      (record as any).last_synced ||
      (record as any).lastSynced ||
      new Date().toISOString(),
  };
}

/**
 * Filter out schema metadata (fld*, viw*, tbl*) from Postgres responses.
 * Only rec* entries are actual data records.
 */
function filterDataRecords(
  records: RecordsResponse['records'],
): RecordsResponse['records'] {
  return records.filter((rec) => {
    const id = rec.id || '';
    return id.startsWith('rec');
  });
}

// =============================================================================
// Version Tracking — Sync Cursors
// =============================================================================

/**
 * Resolve the best cursor value from an API response.
 * Priority: server next_since > max record timestamp > NEVER client clock.
 */
function resolveCursorFromResponse(
  data: any,
  records: any[],
): ResolvedCursor {
  // 1. Server-provided cursor (authoritative, preferred)
  if (data?.next_since) {
    return { value: data.next_since, source: 'server-next-since' };
  }

  // 2. Max last_synced from response records (server-generated timestamps)
  if (records && records.length > 0) {
    const maxTs = records.reduce((max: string, r: any) => {
      const ts = r.last_synced || r.lastSynced || '';
      return ts > max ? ts : max;
    }, '');
    if (maxTs) {
      return { value: maxTs, source: 'server-record-max' };
    }
  }

  // 3. Client clock as LAST RESORT
  console.warn(
    '[Hydration] No server cursor available -- falling back to client clock.',
  );
  return { value: new Date().toISOString(), source: 'client-clock-fallback' };
}

// =============================================================================
// Batched Write Pipeline
// =============================================================================

/**
 * Write records to IndexedDB in batches of config.BATCH_SIZE, then cache them.
 */
async function writeRecordsBatched(
  records: AminoRecord[],
  tableId: string,
  cryptoKey: CryptoKey | null,
  deferEncryption: boolean,
): Promise<number> {
  let written = 0;

  for (let b = 0; b < records.length; b += config.BATCH_SIZE) {
    const batch = records.slice(b, b + config.BATCH_SIZE);
    await idb.putRecordsBatch(batch, cryptoKey, deferEncryption);
    written += batch.length;
  }

  return written;
}

// =============================================================================
// Table Ordering
// =============================================================================

/** Order tables for hydration according to the configured strategy. */
function orderTables(tableIds: string[], tables: AminoTable[]): string[] {
  const strategy = config.TABLE_ORDER;

  if (strategy === 'api-order') {
    return tableIds.slice();
  }

  if (strategy === 'priority') {
    const prioritySet = new Map<string, number>();
    config.TABLE_PRIORITY.forEach((id, idx) => prioritySet.set(id, idx));

    const prioritized: string[] = [];
    const rest: string[] = [];
    for (const id of tableIds) {
      if (prioritySet.has(id)) {
        prioritized.push(id);
      } else {
        rest.push(id);
      }
    }
    prioritized.sort(
      (a, b) => (prioritySet.get(a) || 0) - (prioritySet.get(b) || 0),
    );
    return prioritized.concat(rest);
  }

  if (strategy === 'smallest' || strategy === 'largest') {
    const tableMap = new Map<string, AminoTable>();
    for (const t of tables) {
      tableMap.set(t.table_id, t);
    }
    return tableIds.slice().sort((a, b) => {
      const countA = tableMap.get(a)?.record_count || 0;
      const countB = tableMap.get(b)?.record_count || 0;
      return strategy === 'smallest' ? countA - countB : countB - countA;
    });
  }

  return tableIds.slice();
}

/** Look up a table name from the tables array. */
function getTableName(tables: AminoTable[], tableId: string): string {
  for (const t of tables) {
    if (t.table_id === tableId) return t.table_name || tableId;
  }
  return tableId;
}

// =============================================================================
// Hydration Options
// =============================================================================

export interface HydrationOptions {
  /** Progress callback, called after each table is hydrated. */
  onProgress?: (progress: HydrationProgress) => void;
  /** Subset of tables to hydrate (default: all). */
  tableIds?: string[];
  /** Override tier order for this run. */
  tierOrder?: HydrationTier[];
}

export interface HydrateContext {
  /** All table IDs to hydrate. */
  tableIds: string[];
  /** Table metadata. */
  tables: AminoTable[];
  /** Matrix access token. */
  accessToken: string;
  /** AES-GCM crypto key (null = no encryption). */
  cryptoKey: CryptoKey | null;
  /** Whether to defer encryption (store plaintext, encrypt on logout). */
  deferEncryption: boolean;
  /** Whether we are in online-only mode (skip IDB). */
  onlineOnlyMode: boolean;
}

// =============================================================================
// Per-Table Hydration — Postgres Tier
// =============================================================================

/**
 * Full hydration of a single table: fetch all records, clear existing, write.
 */
export async function hydrateTableFromPostgres(
  ctx: HydrateContext,
  tableId: string,
): Promise<{ count: number; cursor: string | null }> {
  const data = await fetchRecords(tableId, ctx.accessToken);
  const records = filterDataRecords(data.records || []);
  const normalized = records.map((rec) => normalizeRecord(rec, tableId));

  if (ctx.onlineOnlyMode) {
    // Online-only: cache in memory, skip IDB
    cache.setFullTable(tableId, normalized);
    searchIndex.buildIndex(normalized);
    return { count: records.length, cursor: null };
  }

  // Full hydration: clear stale data, then write
  await idb.deleteTableRecords(tableId);
  await writeRecordsBatched(normalized, tableId, ctx.cryptoKey, ctx.deferEncryption);

  // Update cursor
  const cursorInfo = resolveCursorFromResponse(data, records);
  const writtenCursor = await idb.putSyncCursor({
    tableId,
    lastSynced: cursorInfo.value,
    cursorSource: cursorInfo.source,
    updatedAt: new Date().toISOString(),
  });

  // Cache full table
  cache.setFullTable(tableId, normalized);
  searchIndex.buildIndex(normalized);

  return { count: records.length, cursor: writtenCursor };
}

/**
 * Sync a single table: incremental if cursor exists, full otherwise.
 */
export async function syncTableFromPostgres(
  ctx: HydrateContext,
  tableId: string,
): Promise<{ count: number; cursor: string | null }> {
  if (ctx.onlineOnlyMode) {
    return hydrateTableFromPostgres(ctx, tableId);
  }

  const existingCursor = await idb.getSyncCursor(tableId);
  const since = existingCursor?.lastSynced ?? null;

  // No cursor -> full hydration
  if (!since) {
    return hydrateTableFromPostgres(ctx, tableId);
  }

  // Incremental sync
  const data = await fetchRecordsSince(tableId, since, ctx.accessToken);
  const records = filterDataRecords(data.records || []);
  const normalized = records.map((rec) => normalizeRecord(rec, tableId));

  if (normalized.length > 0) {
    await writeRecordsBatched(
      normalized,
      tableId,
      ctx.cryptoKey,
      ctx.deferEncryption,
    );

    // Update cache for changed records
    for (const record of normalized) {
      cache.set(record.tableId, record.id, record);
      searchIndex.indexRecord(record);
    }
  }

  // Advance cursor
  const cursorInfo = resolveCursorFromResponse(data, records);
  const writtenCursor = await idb.putSyncCursor({
    tableId,
    lastSynced: cursorInfo.value,
    cursorSource: cursorInfo.source,
    updatedAt: new Date().toISOString(),
  });

  return { count: records.length, cursor: writtenCursor };
}

// =============================================================================
// Postgres Tier — All Tables
// =============================================================================

/**
 * Hydrate all tables from Postgres (the default tier).
 */
async function tierPostgres(
  ctx: HydrateContext,
  options: HydrationOptions,
): Promise<HydrationResult> {
  const onProgress = options.onProgress ?? null;
  const tableIds = orderTables(ctx.tableIds, ctx.tables);
  let totalHydrated = 0;

  for (let i = 0; i < tableIds.length; i++) {
    const tableId = tableIds[i];
    try {
      const result = await syncTableFromPostgres(ctx, tableId);
      totalHydrated += result.count;
      if (onProgress) {
        onProgress({
          tableId,
          tableName: getTableName(ctx.tables, tableId),
          tableIndex: i,
          tableCount: tableIds.length,
          recordCount: result.count,
          totalRecords: totalHydrated,
        });
      }
    } catch (err: any) {
      console.error('[Hydration] Failed to hydrate table', tableId, ':', err);
      if (err.status === 401) throw err;
    }
  }

  return {
    success: true,
    totalRecords: totalHydrated,
    totalTables: tableIds.length,
    tier: 'postgres',
  };
}

// =============================================================================
// Main Orchestrator
// =============================================================================

/**
 * Run the hydration flow. Tries tiers in order until one succeeds.
 *
 * @param ctx     - Hydration context (auth, crypto, tables)
 * @param options - Progress callbacks, table subset, tier overrides
 * @returns Hydration result with total records and tier used
 */
export async function run(
  ctx: HydrateContext,
  options: HydrationOptions = {},
): Promise<HydrationResult> {
  const tiers = options.tierOrder || config.TIER_ORDER;

  console.log('[Hydration] Starting with tier order:', tiers.join(' -> '));
  console.log('[Hydration] Table order strategy:', config.TABLE_ORDER);

  // If specific tables requested, override for this run
  const effectiveCtx: HydrateContext = options.tableIds
    ? { ...ctx, tableIds: options.tableIds }
    : ctx;

  for (const tier of tiers) {
    console.log('[Hydration] Attempting tier:', tier);

    try {
      let result: HydrationResult;

      switch (tier) {
        case 'postgres':
          result = await tierPostgres(effectiveCtx, options);
          break;
        default:
          console.warn('[Hydration] Unknown tier:', tier);
          continue;
      }

      if (result && result.totalRecords > 0) {
        console.log(
          '[Hydration] Tier',
          tier,
          'succeeded:',
          result.totalRecords,
          'records',
        );
        result.tier = tier;
        return result;
      }
    } catch (err: any) {
      console.error('[Hydration] Tier', tier, 'failed:', err.message || err);
      if (err.status === 401) throw err;
    }
  }

  console.error('[Hydration] All tiers exhausted, no records hydrated');
  return { success: false, totalRecords: 0, totalTables: 0, tier: null };
}

/**
 * Convenience: hydrate a single table (full fetch).
 */
export async function hydrateTable(
  ctx: HydrateContext,
  tableId: string,
): Promise<number> {
  const result = await hydrateTableFromPostgres(ctx, tableId);
  return result.count;
}

/**
 * Convenience: sync a single table (incremental if possible).
 */
export async function syncTable(
  ctx: HydrateContext,
  tableId: string,
): Promise<number> {
  const result = await syncTableFromPostgres(ctx, tableId);
  return result.count;
}
