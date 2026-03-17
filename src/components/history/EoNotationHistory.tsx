import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../state/AuthContext';
import { useSchema } from '../../state/SchemaContext';
import { useEmittedOps, toAminoEvent } from '../../state/EmittedOpsContext';
import type { EmittedOp } from '../../state/EmittedOpsContext';
import { fetchEventsBySet, fetchEventsSince } from '../../services/data/api';
import type { AminoEvent } from '../../services/data/types';
import { normalizeFieldOps } from '../../services/data/eo-ops';
import { describeFieldOps } from '../../utils/eo-format';

// ============================================================================
// Unified event type — wraps both DB events and local emitted ops
// ============================================================================

interface UnifiedEvent extends AminoEvent {
  /** Where this event came from. */
  _source: 'db' | 'data' | 'schema' | 'interface' | 'matrix' | 'sync';
  /** Human-readable description (for local ops). */
  _description?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function opLabel(event: UnifiedEvent): { text: string; className: string } {
  const op = event.operator?.toUpperCase() || '';
  if (op === 'INS' || op === 'INSERT') return { text: 'INS', className: 'eo-badge--ins' };
  if (op === 'NUL' || op === 'DELETE') return { text: 'NUL', className: 'eo-badge--nul' };
  if (op === 'SYNC') return { text: 'SYNC', className: 'eo-badge--sync' };
  if (op === 'INFO') return { text: 'INFO', className: 'eo-badge--sync' };
  return { text: 'ALT', className: 'eo-badge--alt' };
}

function sourceLabel(source: UnifiedEvent['_source']): { text: string; className: string } {
  switch (source) {
    case 'db': return { text: 'DB', className: 'eo-source--db' };
    case 'data': return { text: 'DATA', className: 'eo-source--data' };
    case 'schema': return { text: 'SCHEMA', className: 'eo-source--schema' };
    case 'interface': return { text: 'UI', className: 'eo-source--interface' };
    case 'matrix': return { text: 'MATRIX', className: 'eo-source--matrix' };
    case 'sync': return { text: 'SYNC', className: 'eo-source--sync' };
    default: return { text: source, className: '' };
  }
}

function FieldOpsDetail({ event }: { event: UnifiedEvent }) {
  const fieldOps = normalizeFieldOps(event.payload ?? {});
  const hasOps = fieldOps.ALT || fieldOps.INS || fieldOps.NUL;
  if (!hasOps) return null;

  return (
    <div className="eo-detail-fields">
      {fieldOps.ALT && Object.entries(fieldOps.ALT).map(([k, v]) => (
        <div key={`alt-${k}`} className="eo-field-change">
          <span className="eo-field-op eo-badge--alt">ALT</span>
          <span className="eo-field-name">{k}</span>
          <span className="eo-field-arrow">&rarr;</span>
          <span className="eo-field-value">{formatValue(v)}</span>
        </div>
      ))}
      {fieldOps.INS && Object.entries(fieldOps.INS).map(([k, v]) => (
        <div key={`ins-${k}`} className="eo-field-change">
          <span className="eo-field-op eo-badge--ins">INS</span>
          <span className="eo-field-name">{k}</span>
          <span className="eo-field-arrow">&rarr;</span>
          <span className="eo-field-value">{formatValue(v)}</span>
        </div>
      ))}
      {fieldOps.NUL && (Array.isArray(fieldOps.NUL) ? fieldOps.NUL : Object.keys(fieldOps.NUL)).map((k) => (
        <div key={`nul-${k}`} className="eo-field-change">
          <span className="eo-field-op eo-badge--nul">NUL</span>
          <span className="eo-field-name">{k}</span>
        </div>
      ))}
    </div>
  );
}

function formatValue(v: any): string {
  if (v == null) return '(empty)';
  if (typeof v === 'string') return v.length > 120 ? v.slice(0, 120) + '...' : v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.length} item${v.length !== 1 ? 's' : ''}]`;
  try { const s = JSON.stringify(v); return s.length > 120 ? s.slice(0, 120) + '...' : s; } catch { return '(object)'; }
}

// ============================================================================
// Component
// ============================================================================

type SourceFilter = '' | 'db' | 'local' | 'data' | 'schema' | 'interface' | 'matrix' | 'sync';

export default function EoNotationHistory() {
  const { session } = useAuth();
  const { tables } = useSchema();
  const { ops: localOps } = useEmittedOps();
  const [dbEvents, setDbEvents] = useState<AminoEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterSet, setFilterSet] = useState<string>('');
  const [filterOp, setFilterOp] = useState<string>('');
  const [filterSource, setFilterSource] = useState<SourceFilter>('');

  const loadEvents = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const resp = filterSet
        ? await fetchEventsBySet(filterSet, session.accessToken, 500)
        : await fetchEventsSince(since, session.accessToken, undefined, 500);
      setDbEvents(resp.events || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [session?.accessToken, filterSet]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Build table name lookup
  const tableNameMap: Record<string, string> = {};
  for (const t of tables) {
    tableNameMap[t.tableId] = t.tableName;
  }

  // Merge DB events + local ops into unified list
  const unified: UnifiedEvent[] = useMemo(() => {
    const fromDb: UnifiedEvent[] = dbEvents.map(e => ({
      ...e,
      _source: 'db' as const,
    }));

    const fromLocal: UnifiedEvent[] = localOps.map(op => ({
      ...toAminoEvent(op),
      _source: op.source as UnifiedEvent['_source'],
      _description: op.description,
    }));

    return [...fromDb, ...fromLocal];
  }, [dbEvents, localOps]);

  // Sort reverse chronological
  const sorted = useMemo(() =>
    [...unified].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    }),
    [unified],
  );

  // Apply filters
  const filtered = useMemo(() => {
    let result = sorted;

    // Source filter
    if (filterSource === 'db') {
      result = result.filter(e => e._source === 'db');
    } else if (filterSource === 'local') {
      result = result.filter(e => e._source !== 'db');
    } else if (filterSource) {
      result = result.filter(e => e._source === filterSource);
    }

    // Set filter
    if (filterSet) {
      result = result.filter(e => e.set === filterSet);
    }

    // Op filter
    if (filterOp) {
      result = result.filter(e => {
        const op = e.operator?.toUpperCase() || '';
        if (filterOp === 'ALT') return op === 'ALT' || op === 'ALTER' || (!['INS', 'INSERT', 'NUL', 'DELETE', 'SYNC', 'INFO'].includes(op));
        if (filterOp === 'INS') return op === 'INS' || op === 'INSERT';
        if (filterOp === 'NUL') return op === 'NUL' || op === 'DELETE';
        if (filterOp === 'SYNC') return op === 'SYNC' || op === 'INFO';
        return true;
      });
    }

    return result;
  }, [sorted, filterSource, filterSet, filterOp]);

  // Unique sets across all events for the filter dropdown
  const uniqueSets = useMemo(() =>
    Array.from(new Set(unified.map(e => e.set).filter(Boolean))).sort(),
    [unified],
  );

  // Counts by source
  const dbCount = unified.filter(e => e._source === 'db').length;
  const localCount = unified.filter(e => e._source !== 'db').length;

  return (
    <div className="eo-history">
      <div className="eo-history-header">
        <h2 className="eo-history-title">Emitted Operations</h2>
        <div className="eo-history-controls">
          <select
            className="eo-filter-select"
            value={filterSource}
            onChange={e => setFilterSource(e.target.value as SourceFilter)}
          >
            <option value="">All sources</option>
            <option value="db">Database ({dbCount})</option>
            <option value="local">Local ({localCount})</option>
            <option value="data">Data mutations</option>
            <option value="schema">Schema changes</option>
            <option value="interface">Interface changes</option>
            <option value="matrix">Matrix events</option>
            <option value="sync">Sync events</option>
          </select>
          <select
            className="eo-filter-select"
            value={filterSet}
            onChange={e => setFilterSet(e.target.value)}
          >
            <option value="">All sets</option>
            {uniqueSets.map(s => (
              <option key={s} value={s}>{tableNameMap[s] || s}</option>
            ))}
          </select>
          <select
            className="eo-filter-select"
            value={filterOp}
            onChange={e => setFilterOp(e.target.value)}
          >
            <option value="">All ops</option>
            <option value="ALT">ALT</option>
            <option value="INS">INS</option>
            <option value="NUL">NUL</option>
            <option value="SYNC">SYNC</option>
          </select>
          <button className="eo-refresh-btn" onClick={loadEvents} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="eo-error">{error}</div>}

      <div className="eo-history-count">
        {filtered.length} event{filtered.length !== 1 ? 's' : ''}
        {' '}({dbCount} from DB, {localCount} local)
        {filterSet || filterOp || filterSource ? ' — filtered' : ''}
      </div>

      <div className="eo-history-list">
        {filtered.map(event => {
          const { text: opText, className: opClass } = opLabel(event);
          const { text: srcText, className: srcClass } = sourceLabel(event._source);
          const fieldOps = normalizeFieldOps(event.payload ?? {});
          const summary = event._description || describeFieldOps(fieldOps);
          const eventKey = `${event._source}-${event.id}`;
          const isExpanded = expandedId === eventKey;
          const setName = tableNameMap[event.set] || event.set || '—';

          return (
            <div
              key={eventKey}
              className={`eo-event-row ${isExpanded ? 'eo-event-row--expanded' : ''}`}
              onClick={() => setExpandedId(isExpanded ? null : eventKey)}
            >
              <div className="eo-event-main">
                <span className={`eo-badge ${opClass}`}>{opText}</span>
                <span className={`eo-source-badge ${srcClass}`}>{srcText}</span>
                <span className="eo-event-time">{formatTimestamp(event.createdAt)}</span>
                <span className="eo-event-set" title={event.set}>{setName}</span>
                <span className="eo-event-record" title={event.recordId}>
                  {event.recordId?.slice(0, 12)}
                </span>
                <span className="eo-event-summary">{summary}</span>
                <span className="eo-event-chevron">{isExpanded ? '▾' : '▸'}</span>
              </div>
              {isExpanded && (
                <div className="eo-event-detail">
                  <div className="eo-detail-meta">
                    <span><strong>Source:</strong> {event._source}</span>
                    <span><strong>Record:</strong> {event.recordId || '—'}</span>
                    <span><strong>Set:</strong> {event.set || '—'}</span>
                    <span><strong>UUID:</strong> {event.uuid || '—'}</span>
                    <span><strong>Event ID:</strong> {event.id}</span>
                  </div>
                  {event._description && (
                    <div className="eo-detail-description">{event._description}</div>
                  )}
                  <FieldOpsDetail event={event} />
                  <details className="eo-raw-payload">
                    <summary>Raw payload</summary>
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          );
        })}
        {!loading && filtered.length === 0 && (
          <div className="eo-empty">No events found. Operations will appear here as you interact with the app.</div>
        )}
      </div>

      <style>{`
        .eo-history {
          padding: var(--space-lg);
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .eo-history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-md);
          flex-shrink: 0;
        }

        .eo-history-title {
          font-size: var(--text-xl);
          font-weight: 600;
          margin: 0;
        }

        .eo-history-controls {
          display: flex;
          gap: var(--space-sm);
          align-items: center;
          flex-wrap: wrap;
        }

        .eo-filter-select {
          padding: 6px 10px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          color: var(--color-text);
          font-size: var(--text-sm);
        }

        .eo-refresh-btn {
          padding: 6px 14px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          color: var(--color-text);
          font-size: var(--text-sm);
          cursor: pointer;
        }

        .eo-refresh-btn:hover {
          background: var(--color-bg-hover, #f5f5f5);
        }

        .eo-refresh-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .eo-error {
          padding: var(--space-sm) var(--space-md);
          background: #fef2f2;
          color: #b91c1c;
          border-radius: var(--radius-sm);
          font-size: var(--text-sm);
          margin-bottom: var(--space-md);
          flex-shrink: 0;
        }

        .eo-history-count {
          font-size: var(--text-sm);
          color: var(--color-text-muted, #888);
          margin-bottom: var(--space-sm);
          flex-shrink: 0;
        }

        .eo-history-list {
          flex: 1;
          overflow-y: auto;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }

        .eo-event-row {
          border-bottom: 1px solid var(--color-border);
          cursor: pointer;
          transition: background 0.1s;
        }

        .eo-event-row:last-child {
          border-bottom: none;
        }

        .eo-event-row:hover {
          background: var(--color-bg-hover, #fafafa);
        }

        .eo-event-row--expanded {
          background: var(--color-bg-hover, #fafafa);
        }

        .eo-event-main {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: 10px var(--space-md);
          font-size: var(--text-sm);
        }

        .eo-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: var(--radius-sm);
          font-size: 11px;
          font-weight: 700;
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }

        .eo-badge--alt {
          background: #dbeafe;
          color: #1e40af;
        }

        .eo-badge--ins {
          background: #dcfce7;
          color: #166534;
        }

        .eo-badge--nul {
          background: #fee2e2;
          color: #991b1b;
        }

        .eo-badge--sync {
          background: #f3e8ff;
          color: #6b21a8;
        }

        /* Source badges */
        .eo-source-badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 600;
          font-family: var(--font-mono, monospace);
          letter-spacing: 0.3px;
          flex-shrink: 0;
        }

        .eo-source--db {
          background: #e0e7ff;
          color: #3730a3;
        }

        .eo-source--data {
          background: #fef3c7;
          color: #92400e;
        }

        .eo-source--schema {
          background: #ede9fe;
          color: #5b21b6;
        }

        .eo-source--interface {
          background: #fce7f3;
          color: #9d174d;
        }

        .eo-source--matrix {
          background: #d1fae5;
          color: #065f46;
        }

        .eo-source--sync {
          background: #f3e8ff;
          color: #6b21a8;
        }

        .eo-event-time {
          color: var(--color-text-muted, #888);
          flex-shrink: 0;
          min-width: 170px;
        }

        .eo-event-set {
          color: var(--color-text);
          font-weight: 500;
          max-width: 160px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .eo-event-record {
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          color: var(--color-text-muted, #888);
          flex-shrink: 0;
        }

        .eo-event-summary {
          color: var(--color-text-muted, #888);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          min-width: 0;
        }

        .eo-event-chevron {
          flex-shrink: 0;
          color: var(--color-text-muted, #aaa);
          font-size: 12px;
        }

        .eo-event-detail {
          padding: var(--space-sm) var(--space-md) var(--space-md);
          border-top: 1px solid var(--color-border);
          background: var(--color-bg);
        }

        .eo-detail-meta {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-md);
          font-size: var(--text-xs);
          color: var(--color-text-muted, #888);
          margin-bottom: var(--space-sm);
        }

        .eo-detail-description {
          font-size: var(--text-sm);
          color: var(--color-text);
          margin-bottom: var(--space-sm);
          padding: var(--space-xs) var(--space-sm);
          background: #f8f8f8;
          border-radius: var(--radius-sm);
        }

        .eo-detail-fields {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: var(--space-sm);
        }

        .eo-field-change {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          font-size: var(--text-sm);
          padding: 3px 0;
        }

        .eo-field-op {
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .eo-field-name {
          font-weight: 500;
          flex-shrink: 0;
        }

        .eo-field-arrow {
          color: var(--color-text-muted, #aaa);
          flex-shrink: 0;
        }

        .eo-field-value {
          font-family: var(--font-mono, monospace);
          font-size: 12px;
          color: var(--color-text-muted, #666);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .eo-raw-payload {
          margin-top: var(--space-sm);
          font-size: var(--text-xs);
        }

        .eo-raw-payload summary {
          cursor: pointer;
          color: var(--color-text-muted, #888);
        }

        .eo-raw-payload pre {
          margin-top: var(--space-xs);
          padding: var(--space-sm);
          background: #f8f8f8;
          border-radius: var(--radius-sm);
          overflow-x: auto;
          font-size: 11px;
          max-height: 300px;
          overflow-y: auto;
        }

        .eo-empty {
          padding: var(--space-xl);
          text-align: center;
          color: var(--color-text-muted, #aaa);
          font-size: var(--text-sm);
        }
      `}</style>
    </div>
  );
}
