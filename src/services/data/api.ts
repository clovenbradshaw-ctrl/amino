// =============================================================================
// Amino API Client — n8n Webhook Communication
//
// Ported from data-layer.js (lines 366-491). All data sync goes through
// n8n webhooks hosted at n8n.intelechia.com. Authentication uses the Matrix
// access token passed as a query parameter (GET) or Authorization header.
//
// Endpoints:
//   GET /amino-tables                          — Fetch table metadata
//   GET /amino-records?tableId=X               — Fetch all records for a table
//   GET /amino-records-since?tableId=X&since=T — Incremental sync
//   GET /amino-record?recordId=X               — Single record with full details
//   GET /amino-events-set?set=X                — Events filtered by set
//   GET /amino-events-since?since=T            — Events since timestamp
//   GET /amino-events-record?recordId=X        — Events for a record
// =============================================================================

import type {
  AminoEvent,
  AminoTable,
  EventsRecordResponse,
  EventsSetResponse,
  EventsSinceResponse,
  RecordsResponse,
  SingleRecordResponse,
  TablesResponse,
} from './types';

/** n8n production webhook base — must be absolute URL (not relative) for GitHub Pages. */
const WEBHOOK_BASE = 'https://n8n.intelechia.com/webhook';
const MAX_RETRIES = 2;

/** Allowed API intent categories (guardrail against misuse). */
type ApiIntent =
  | 'metadataSync'
  | 'fullBackfill'
  | 'incrementalBackfill'
  | 'onlineRead'
  | 'eventQuery';

/**
 * Internal fetch wrapper with retry logic and dual auth strategies.
 *
 * Ported from data-layer.js apiFetch(). Tries:
 *   1. GET with access_token query parameter
 *   2. Fallback to Authorization: Bearer header on network/CORS failure
 *   3. Retry on 5xx errors (up to MAX_RETRIES times)
 *   4. Throw immediately on 401 (auth expired)
 */
export async function apiFetch(
  path: string,
  accessToken: string,
  intent: ApiIntent,
): Promise<any> {
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = attempt === 1 ? 1000 : 3000;
      console.log(
        `[API] Retry ${attempt}/${MAX_RETRIES} for ${path} (waiting ${delay}ms)`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }

    // Build URL with access_token as query parameter
    const separator = path.indexOf('?') === -1 ? '?' : '&';
    const url =
      WEBHOOK_BASE +
      path +
      separator +
      'access_token=' +
      encodeURIComponent(accessToken);

    let response: Response;
    try {
      response = await fetch(url);
    } catch (fetchErr: any) {
      // Network / CORS failure — try header auth as last resort
      console.warn(
        `[API] GET fetch failed (${fetchErr.message}), retrying with header auth for ${path}`,
      );
      try {
        response = await fetch(WEBHOOK_BASE + path, {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
        });
      } catch (headerErr: any) {
        lastErr = new Error(
          'API unreachable (CORS/network): ' + headerErr.message,
        );
        continue;
      }
    }

    if (response.status === 401) {
      // Token may not have been picked up — retry with header auth
      console.warn(`[API] 401, retrying with header auth for ${path}`);
      try {
        response = await fetch(WEBHOOK_BASE + path, {
          headers: {
            Authorization: 'Bearer ' + accessToken,
          },
        });
      } catch (headerErr: any) {
        const err = new Error('Authentication expired (CORS/network)');
        (err as any).status = 401;
        throw err;
      }
      if (response.status === 401) {
        const err = new Error('Authentication expired');
        (err as any).status = 401;
        throw err;
      }
    }

    // Retry on 5xx server errors (transient failures, n8n overload)
    if (response.status >= 500) {
      let errBody = '';
      try {
        errBody = await response.text();
      } catch {
        /* ignore */
      }
      console.warn(
        `[API] Server error ${response.status} for ${path}` +
          (errBody ? ' -- body: ' + errBody.substring(0, 200) : ''),
      );
      lastErr = new Error(
        'API error: ' +
          response.status +
          (errBody ? ' (' + errBody.substring(0, 100) + ')' : ''),
      );
      continue;
    }

    if (!response.ok) {
      let errMsg = 'API error: ' + response.status;
      try {
        const body = await response.json();
        if (body.error) errMsg = body.error;
      } catch {
        /* ignore parse errors */
      }
      throw new Error(errMsg);
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      console.log(
        `[API] Empty response for ${path} -- treating as empty result set`,
      );
      return { records: [] };
    }
    return JSON.parse(text);
  }

  // All retries exhausted
  throw lastErr || new Error(`API failed after ${MAX_RETRIES + 1} attempts`);
}

// =============================================================================
// High-level API Functions
// =============================================================================

/**
 * Fetch table metadata from /amino-tables.
 *
 * @param accessToken - Matrix access token
 * @returns Array of AminoTable objects
 */
export async function fetchTables(
  accessToken: string,
): Promise<AminoTable[]> {
  const data: TablesResponse = await apiFetch(
    '/amino-tables',
    accessToken,
    'metadataSync',
  );
  return data.tables || [];
}

/**
 * Fetch all records for a table from /amino-records.
 *
 * @param tableId     - Airtable table ID
 * @param accessToken - Matrix access token
 * @returns RecordsResponse with records array and optional cursor
 */
export async function fetchRecords(
  tableId: string,
  accessToken: string,
): Promise<RecordsResponse> {
  return apiFetch(
    '/amino-records?tableId=' + encodeURIComponent(tableId),
    accessToken,
    'fullBackfill',
  );
}

/**
 * Fetch records changed since a cursor timestamp (incremental sync).
 *
 * @param tableId     - Airtable table ID
 * @param since       - ISO timestamp cursor
 * @param accessToken - Matrix access token
 * @returns RecordsResponse with changed records
 */
export async function fetchRecordsSince(
  tableId: string,
  since: string,
  accessToken: string,
): Promise<RecordsResponse> {
  return apiFetch(
    '/amino-records-since?tableId=' +
      encodeURIComponent(tableId) +
      '&since=' +
      encodeURIComponent(since),
    accessToken,
    'incrementalBackfill',
  );
}

/**
 * Fetch field definitions for a table from /amino-fields.
 *
 * @param tableId     - Table ID
 * @param accessToken - Matrix access token
 * @returns Raw field data (array or object with .fields property)
 */
export async function fetchFields(
  tableId: string,
  accessToken: string,
): Promise<any> {
  return apiFetch(
    '/amino-fields?tableId=' + encodeURIComponent(tableId),
    accessToken,
    'metadataSync',
  );
}

// =============================================================================
// Single Record Lookup
// =============================================================================

/**
 * Fetch a single record with full details from /amino-record.
 *
 * @param recordId    - Record ID to look up
 * @param accessToken - Matrix access token
 * @returns SingleRecordResponse with record or error
 */
export async function fetchRecord(
  recordId: string,
  accessToken: string,
): Promise<SingleRecordResponse> {
  return apiFetch(
    '/amino-record?recordId=' + encodeURIComponent(recordId),
    accessToken,
    'onlineRead',
  );
}

// =============================================================================
// Event Log Queries
// =============================================================================

/**
 * Parse event payload if it arrived as a JSON string (double-encoded by n8n's
 * JSON.stringify when the PostgreSQL column is text rather than JSONB).
 */
function normalizeEventPayloads(events: AminoEvent[]): AminoEvent[] {
  return events.map(e => {
    if (typeof e.payload === 'string') {
      try { return { ...e, payload: JSON.parse(e.payload) }; } catch { /* keep as-is */ }
    }
    return e;
  });
}

/**
 * Fetch events for a given set from /amino-events-set.
 *
 * @param set         - Event set name
 * @param accessToken - Matrix access token
 * @param limit       - Max events to return (default 500)
 * @returns EventsSetResponse with events array
 */
export async function fetchEventsBySet(
  set: string,
  accessToken: string,
  limit?: number,
): Promise<EventsSetResponse> {
  let path = '/amino-events-set?set=' + encodeURIComponent(set);
  if (limit) path += '&limit=' + limit;
  const data = await apiFetch(path, accessToken, 'eventQuery');
  return {
    set: data.set || set,
    count: data.count ?? (data.events || []).length,
    events: normalizeEventPayloads(data.events || []),
  };
}

/**
 * Fetch events since a timestamp from /amino-events-since.
 *
 * @param since       - ISO timestamp cursor
 * @param accessToken - Matrix access token
 * @param set         - Optional set filter
 * @param limit       - Max events to return (default 500)
 * @returns EventsSinceResponse with events array
 */
export async function fetchEventsSince(
  since: string,
  accessToken: string,
  set?: string,
  limit?: number,
): Promise<EventsSinceResponse> {
  let path = '/amino-events-since?since=' + encodeURIComponent(since);
  if (set) path += '&set=' + encodeURIComponent(set);
  if (limit) path += '&limit=' + limit;
  const data = await apiFetch(path, accessToken, 'eventQuery');
  return {
    since: data.since || since,
    count: data.count ?? (data.events || []).length,
    events: normalizeEventPayloads(data.events || []),
  };
}

/**
 * Fetch events for a specific record from /amino-events-record.
 *
 * @param recordId    - Record ID to fetch events for
 * @param accessToken - Matrix access token
 * @returns EventsRecordResponse with events array
 */
export async function fetchEventsByRecord(
  recordId: string,
  accessToken: string,
): Promise<EventsRecordResponse> {
  const data = await apiFetch(
    '/amino-events-record?recordId=' + encodeURIComponent(recordId),
    accessToken,
    'eventQuery',
  );
  return {
    recordId: data.recordId || recordId,
    count: data.count ?? (data.events || []).length,
    events: normalizeEventPayloads(data.events || []),
  };
}
