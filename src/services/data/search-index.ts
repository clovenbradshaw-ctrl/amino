// =============================================================================
// Amino Search Index — Per-Table Full-Text Search
//
// Ported from data-layer.js (lines 667-732, 1297-1338). Builds a pre-computed
// search index from record fields for fast local search. Each record is mapped
// to a lowercased concatenated string of its ID, field names, and field values.
//
// Features:
//   - Multi-word AND search (all tokens must match)
//   - Recursive text extraction from nested objects/arrays
//   - Debounced index rebuilds
//   - Version tracking for UI staleness detection
// =============================================================================

import type { AminoRecord } from './types';

// =============================================================================
// Index State
// =============================================================================

/** recordId -> lowercased searchable text */
const _index = new Map<string, string>();

/** Monotonically increasing version, bumped on any index change. */
let _version = 0;

/** Debounce timers per table. */
const _rebuildTimers = new Map<string, ReturnType<typeof setTimeout>>();

const REBUILD_DEBOUNCE_MS = 150;

// =============================================================================
// Text Extraction
// =============================================================================

/**
 * Recursively extract all searchable text from a value.
 * Handles strings, numbers, booleans, arrays, and nested objects.
 */
function collectText(value: any): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);

  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const p = collectText(value[i]);
      if (p) parts.push(p);
    }
    return parts.join(' ');
  }

  if (typeof value === 'object') {
    const objParts: string[] = [];
    for (const k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      objParts.push(k);
      const vp = collectText(value[k]);
      if (vp) objParts.push(vp);
    }
    return objParts.join(' ');
  }

  return String(value);
}

/**
 * Build a single lowercased searchable string for a record.
 * Includes the record ID, all field names, and all field values.
 */
function buildSearchText(record: AminoRecord): string {
  const parts: string[] = [record.id];
  const fields = record.fields || {};
  for (const key in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    parts.push(key);
    const text = collectText(fields[key]);
    if (text) parts.push(text);
  }
  return parts.join(' ').toLowerCase();
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build (or rebuild) the search index from an array of records.
 * Typically called after a table is fully hydrated.
 */
export function buildIndex(records: AminoRecord[]): void {
  for (const record of records) {
    _index.set(record.id, buildSearchText(record));
  }
  _version++;
}

/**
 * Update the index for a single record (on create/update).
 */
export function indexRecord(record: AminoRecord): void {
  _index.set(record.id, buildSearchText(record));
  _version++;
}

/**
 * Remove a record from the index.
 */
export function removeRecord(recordId: string): void {
  if (_index.delete(recordId)) {
    _version++;
  }
}

/**
 * Remove all entries for a set of record IDs (e.g. when a table is cleared).
 */
export function removeRecords(recordIds: Iterable<string>): void {
  let changed = false;
  for (const id of recordIds) {
    if (_index.delete(id)) changed = true;
  }
  if (changed) _version++;
}

/**
 * Search the index for records matching a query.
 * Supports multi-word AND queries (all tokens must be present).
 *
 * @param query     - Search query string
 * @param recordIds - Optional set of record IDs to search within (e.g. a single table)
 * @returns Array of matching record IDs
 */
export function search(
  query: string,
  recordIds?: Iterable<string>,
): string[] {
  if (!query || !query.trim()) return [];

  const tokens = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (!tokens.length) return [];

  const results: string[] = [];

  const idsToSearch = recordIds || _index.keys();

  for (const recordId of idsToSearch) {
    const haystack = _index.get(recordId);
    if (!haystack) continue;

    let match = true;
    for (const token of tokens) {
      if (haystack.indexOf(token) === -1) {
        match = false;
        break;
      }
    }
    if (match) {
      results.push(recordId);
    }
  }

  return results;
}

/**
 * Schedule a debounced rebuild for a table's records.
 * Coalesces rapid updates (e.g. during hydration) into a single rebuild.
 *
 * @param tableId    - Table identifier (for debounce grouping)
 * @param getRecords - Function that returns the current records for the table
 */
export function scheduleRebuild(
  tableId: string,
  getRecords: () => AminoRecord[],
): void {
  const existing = _rebuildTimers.get(tableId);
  if (existing) clearTimeout(existing);

  _rebuildTimers.set(
    tableId,
    setTimeout(() => {
      _rebuildTimers.delete(tableId);
      const records = getRecords();
      buildIndex(records);
    }, REBUILD_DEBOUNCE_MS),
  );
}

/**
 * Get the current index version. The UI can use this to detect staleness
 * and re-render only when the index has changed.
 */
export function getVersion(): number {
  return _version;
}

/**
 * Get the raw search index (read-only). For advanced UI use cases
 * that need direct access to the search text.
 *
 * @returns A readonly Map of recordId -> searchText
 */
export function getRawIndex(): ReadonlyMap<string, string> {
  return _index;
}

/**
 * Clear the entire search index.
 */
export function clear(): void {
  _index.clear();

  // Cancel any pending rebuilds
  for (const timer of _rebuildTimers.values()) {
    clearTimeout(timer);
  }
  _rebuildTimers.clear();

  _version++;
}
