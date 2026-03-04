// =============================================================================
// Amino Sync Deduplication — Event Dedup & Echo Suppression
//
// Ported from hydration.js (lines 78-172). Three independent mechanisms
// prevent duplicate processing of events across overlapping sync channels.
//
// 1. Event ID Deduplication — Prevents the same Matrix event from being
//    applied twice (e.g. received via both Matrix sync and HTTP poll).
//
// 2. Optimistic Write Echo Suppression — When a client writes a field,
//    the server echoes it back via /sync. This detects and skips those
//    redundant echoes within a 30-second window.
//
// 3. Version Cursors — Per-table sync cursors that never regress,
//    ensuring we don't re-process already-synced data.
// =============================================================================

import type { FieldOps, SyncCursor } from './types';

// =============================================================================
// Configuration
// =============================================================================

const PROCESSED_EVENT_TTL_MS = 300_000;    // 5 minutes — event ID dedup window
const MAX_PROCESSED_EVENTS = 5_000;        // Prune dedup map when exceeds this
const OPTIMISTIC_WRITE_TTL_MS = 30_000;    // 30 seconds — echo suppression window

// =============================================================================
// 1. Event ID Deduplication
// =============================================================================

/** eventId -> timestamp (ms) when first seen */
const _processedEventIds = new Map<string, number>();

/**
 * Mark an event as processed. Returns true if the event was ALREADY seen
 * (i.e., it's a duplicate), false if this is the first time.
 */
export function markEventProcessed(eventId: string): boolean {
  if (!eventId) return false;
  if (_processedEventIds.has(eventId)) return true; // already seen

  _processedEventIds.set(eventId, Date.now());
  _pruneProcessedEvents();
  return false;
}

/**
 * Check if an event has been processed without marking it.
 */
export function isDuplicate(eventId: string): boolean {
  if (!eventId) return false;
  return _processedEventIds.has(eventId);
}

/**
 * Track an event ID as seen (alias for markEventProcessed, returns void).
 */
export function trackEvent(eventId: string): void {
  markEventProcessed(eventId);
}

/**
 * Prune the processed events map:
 *   1. Remove entries older than PROCESSED_EVENT_TTL_MS
 *   2. If still over limit, drop the oldest half
 */
function _pruneProcessedEvents(): void {
  if (_processedEventIds.size <= MAX_PROCESSED_EVENTS) return;

  const now = Date.now();

  // Pass 1: Remove expired entries
  for (const [id, ts] of _processedEventIds) {
    if (now - ts > PROCESSED_EVENT_TTL_MS) {
      _processedEventIds.delete(id);
    }
  }

  // Pass 2: If still over limit, drop oldest half
  if (_processedEventIds.size > MAX_PROCESSED_EVENTS) {
    const entries = Array.from(_processedEventIds.entries());
    entries.sort((a, b) => a[1] - b[1]);
    const dropCount = Math.floor(entries.length / 2);
    for (let i = 0; i < dropCount; i++) {
      _processedEventIds.delete(entries[i][0]);
    }
  }
}

// =============================================================================
// 2. Optimistic Write Echo Suppression
// =============================================================================

interface OptimisticEntry {
  fields: Record<string, any>;
  ts: number;
}

/** recordId -> { fields, ts } */
const _optimisticWrites = new Map<string, OptimisticEntry>();

/**
 * Track a local write so its echo from the server can be suppressed.
 *
 * @param recordId     - The record that was written
 * @param changedFields - The field values that were sent
 */
export function trackOptimisticWrite(
  recordId: string,
  changedFields: Record<string, any>,
): void {
  _optimisticWrites.set(recordId, {
    fields: changedFields,
    ts: Date.now(),
  });
}

/**
 * Alias for trackOptimisticWrite (matches the txnId naming convention
 * used in some Matrix client implementations).
 */
export function trackOptimisticEcho(
  txnId: string,
  recordId: string,
  changedFields: Record<string, any>,
): void {
  trackOptimisticWrite(recordId, changedFields);
}

/**
 * Check whether an incoming field operation is an echo of a recent
 * optimistic write. If so, returns true and clears the tracking entry.
 *
 * @param recordId         - The record the event targets
 * @param incomingFieldOps - The field operations from the incoming event
 * @returns true if this is an echo that should be suppressed
 */
export function isOptimisticEcho(
  recordId: string,
  incomingFieldOps: FieldOps,
): boolean {
  const entry = _optimisticWrites.get(recordId);
  if (!entry) return false;

  // Expired entry — not an echo
  if (Date.now() - entry.ts > OPTIMISTIC_WRITE_TTL_MS) {
    _optimisticWrites.delete(recordId);
    return false;
  }

  const alt = incomingFieldOps.ALT;
  if (!alt) return false;

  // Compare each ALT field against what we optimistically wrote
  const optimistic = entry.fields;
  const altKeys = Object.keys(alt);
  for (let i = 0; i < altKeys.length; i++) {
    if (!_looseFieldEqual(alt[altKeys[i]], optimistic[altKeys[i]])) {
      return false;
    }
  }

  // All fields match — this is an echo
  _optimisticWrites.delete(recordId);
  return true;
}

/**
 * Prune expired optimistic write entries.
 * Call periodically (e.g. on each sync cycle) to prevent unbounded growth.
 */
export function pruneOptimisticWrites(): void {
  const now = Date.now();
  for (const [id, entry] of _optimisticWrites) {
    if (now - entry.ts > OPTIMISTIC_WRITE_TTL_MS) {
      _optimisticWrites.delete(id);
    }
  }
}

/**
 * Loose comparison for echo detection. Handles type coercion from server
 * normalisation (e.g. "123" vs 123, "true" vs true).
 */
function _looseFieldEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  const typeA = typeof a;
  const typeB = typeof b;
  if (
    typeA !== typeB &&
    (typeA === 'string' || typeA === 'number' || typeA === 'boolean') &&
    (typeB === 'string' || typeB === 'number' || typeB === 'boolean')
  ) {
    return String(a) === String(b);
  }

  return JSON.stringify(a) === JSON.stringify(b);
}

// =============================================================================
// 3. Version Cursors
//
// Per-table sync cursors are stored in IndexedDB via the idb-store module.
// This module provides in-memory cursor tracking for the current session.
// =============================================================================

/** In-memory cursor cache: tableId -> lastSynced ISO string */
const _cursorCache = new Map<string, string>();

/**
 * Get the cached cursor for a table (in-memory only).
 * For persistent cursors, use idb-store.getSyncCursor().
 */
export function getCachedCursor(tableId: string): string | null {
  return _cursorCache.get(tableId) ?? null;
}

/**
 * Update the in-memory cursor cache. Enforces monotonic advance
 * (never regresses to an older timestamp).
 */
export function updateCursorCache(tableId: string, cursor: string): void {
  const existing = _cursorCache.get(tableId);
  if (existing && existing >= cursor) {
    // Don't regress
    return;
  }
  _cursorCache.set(tableId, cursor);
}

// =============================================================================
// Reset — Clear all dedup/tracking state (call on logout)
// =============================================================================

/**
 * Reset all deduplication state. Call on logout to prevent stale data
 * from leaking into a subsequent session.
 */
export function reset(): void {
  _processedEventIds.clear();
  _optimisticWrites.clear();
  _cursorCache.clear();
}
