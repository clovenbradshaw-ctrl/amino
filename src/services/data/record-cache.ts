// =============================================================================
// Amino Record Cache — In-Memory LRU Cache
//
// Ported from data-layer.js (lines 585-665). Keeps decrypted records in
// memory for fast access. Uses LRU (Least Recently Used) eviction to bound
// memory usage at MAX_ENTRIES.
//
// Design:
//   - _cacheById: recordId -> { record, lastAccessed }
//   - _tableIndex: tableId -> Set<recordId>
//   - _hydratedTables: tableId -> true (marks fully-loaded tables)
//   - Max 2000 entries; LRU eviction when exceeded
// =============================================================================

import type { AminoRecord } from './types';

const MAX_ENTRIES = 2000;

interface CacheEntry {
  record: AminoRecord;
  lastAccessed: number;
}

// =============================================================================
// Cache State
// =============================================================================

const _cacheById = new Map<string, CacheEntry>();
const _tableIndex = new Map<string, Set<string>>();
const _hydratedTables = new Set<string>();

// =============================================================================
// LRU Eviction
// =============================================================================

/**
 * Evict least-recently-used entries when cache exceeds MAX_ENTRIES.
 * Removes the oldest half of entries to amortise eviction cost.
 */
function _evictIfNeeded(): void {
  if (_cacheById.size <= MAX_ENTRIES) return;

  // Collect entries sorted by lastAccessed ascending (oldest first)
  const entries = Array.from(_cacheById.entries());
  entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

  const dropCount = Math.floor(entries.length / 2);
  for (let i = 0; i < dropCount; i++) {
    const [recordId, entry] = entries[i];
    _cacheById.delete(recordId);

    // Clean up table index
    const tableSet = _tableIndex.get(entry.record.tableId);
    if (tableSet) {
      tableSet.delete(recordId);
      if (tableSet.size === 0) {
        _tableIndex.delete(entry.record.tableId);
        _hydratedTables.delete(entry.record.tableId);
      }
    }
  }
}

// =============================================================================
// Clone Helper
// =============================================================================

/** Deep-clone a record to prevent external mutation of cached data. */
function _cloneRecord(record: AminoRecord): AminoRecord {
  if (typeof structuredClone === 'function') {
    return structuredClone(record);
  }
  return JSON.parse(JSON.stringify(record));
}

/** Check if a record is a tombstone (soft-deleted). */
function _isTombstone(record: AminoRecord): boolean {
  return record?.fields?._deleted === true;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get a single record from cache (cloned).
 * Returns null if not found.
 */
export function get(
  tableId: string,
  recordId: string,
): AminoRecord | null {
  const entry = _cacheById.get(recordId);
  if (!entry) return null;

  // Update access time for LRU
  entry.lastAccessed = Date.now();
  return _cloneRecord(entry.record);
}

/**
 * Get a single record from cache WITHOUT cloning (read-only, do not mutate!).
 * For internal/performance-critical use where caller guarantees no mutation.
 */
export function getRef(recordId: string): AminoRecord | null {
  const entry = _cacheById.get(recordId);
  if (!entry) return null;
  entry.lastAccessed = Date.now();
  return entry.record;
}

/**
 * Store a record in cache. Skips tombstoned records.
 * Triggers LRU eviction if cache exceeds MAX_ENTRIES.
 */
export function set(
  tableId: string,
  recordId: string,
  record: AminoRecord,
): void {
  // Skip tombstoned records
  if (_isTombstone(record)) return;

  _cacheById.set(recordId, {
    record: _cloneRecord(record),
    lastAccessed: Date.now(),
  });

  // Update table index
  if (!_tableIndex.has(tableId)) {
    _tableIndex.set(tableId, new Set());
  }
  _tableIndex.get(tableId)!.add(recordId);

  _evictIfNeeded();
}

/**
 * Get all cached records for a table (cloned).
 * Returns null if the table is not fully hydrated in cache.
 */
export function getByTable(tableId: string): AminoRecord[] | null {
  if (!_hydratedTables.has(tableId)) return null;

  const recordIds = _tableIndex.get(tableId);
  if (!recordIds) return [];

  const now = Date.now();
  const results: AminoRecord[] = [];
  for (const recordId of recordIds) {
    const entry = _cacheById.get(recordId);
    if (entry) {
      entry.lastAccessed = now;
      results.push(_cloneRecord(entry.record));
    }
  }
  return results;
}

/**
 * Get all cached records for a table WITHOUT cloning (read-only).
 * Returns null if the table is not fully hydrated in cache.
 */
export function getByTableRef(tableId: string): AminoRecord[] | null {
  if (!_hydratedTables.has(tableId)) return null;

  const recordIds = _tableIndex.get(tableId);
  if (!recordIds) return [];

  const now = Date.now();
  const results: AminoRecord[] = [];
  for (const recordId of recordIds) {
    const entry = _cacheById.get(recordId);
    if (entry) {
      entry.lastAccessed = now;
      results.push(entry.record);
    }
  }
  return results;
}

/**
 * Cache a full table (clears existing cache for that table first).
 * Marks the table as hydrated so getByTable() returns results.
 */
export function setFullTable(tableId: string, records: AminoRecord[]): void {
  // Clear existing entries for this table
  invalidateTable(tableId);

  for (const record of records) {
    if (_isTombstone(record)) continue;
    set(tableId, record.id, record);
  }
  _hydratedTables.add(tableId);
}

/** Check if a table has been fully loaded into cache. */
export function isTableHydrated(tableId: string): boolean {
  return _hydratedTables.has(tableId);
}

/**
 * Invalidate (remove) a single record from cache.
 */
export function invalidate(tableId: string, recordId: string): void {
  _cacheById.delete(recordId);
  const tableSet = _tableIndex.get(tableId);
  if (tableSet) {
    tableSet.delete(recordId);
    if (tableSet.size === 0) {
      _tableIndex.delete(tableId);
      _hydratedTables.delete(tableId);
    }
  }
}

/**
 * Invalidate all records for a table.
 */
export function invalidateTable(tableId: string): void {
  const recordIds = _tableIndex.get(tableId);
  if (recordIds) {
    for (const recordId of recordIds) {
      _cacheById.delete(recordId);
    }
  }
  _tableIndex.delete(tableId);
  _hydratedTables.delete(tableId);
}

/**
 * Clear the entire cache.
 */
export function clear(): void {
  _cacheById.clear();
  _tableIndex.clear();
  _hydratedTables.clear();
}

/**
 * Get current cache statistics (for debugging/monitoring).
 */
export function getStats(): {
  totalEntries: number;
  maxEntries: number;
  tableCount: number;
  hydratedTableCount: number;
} {
  return {
    totalEntries: _cacheById.size,
    maxEntries: MAX_ENTRIES,
    tableCount: _tableIndex.size,
    hydratedTableCount: _hydratedTables.size,
  };
}
