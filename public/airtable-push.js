/* airtable-push.js — outbound sync, this workspace → Airtable.
 *
 * The symmetric other half of airtable-sync.js (which is PULL only). This is the
 * pluggable `window.AirtablePush` drain the coordinator stages: when present,
 * airtable-coordinator.js starts it for EVERY member (no hand — push is
 * automatic; each change is authored once, so it's pushed once). Its job is to
 * carry local edits of Airtable-sourced rows back up to Airtable:
 *
 *     local edit of a synced row (has _recordId)  → PATCH that Airtable record
 *     new row added to a synced table (no id)     → POST a record, then DEF the
 *                                                   returned _recordId back onto
 *                                                   the entity so future edits
 *                                                   update instead of re-create
 *     row moved to the _deleted partition          → DELETE that Airtable record
 *
 * WHAT PUSHES. Only entities that live in the fold (`state.entities`) whose
 * `_type` is an Airtable-imported set for this base. The bulk of rows stay in the
 * cold import blob (never folded) and are never touched — exactly mirroring the
 * pull side, so the heap/quota budget holds. Computed / linked / formula columns
 * are never written (Airtable rejects writes to them); field types come from the
 * already-folded `state.schema.fields.<set>`.
 *
 * ECHO-FREE, both directions, with NO shared cursor:
 *   - push → pull: the webhook is created with `fromSources:["client"]`
 *     (airtable-sync.js), so our API writes are excluded from the inbound diff
 *     stream — a value we push never comes back as an inbound change.
 *   - pull → push: before PATCHing, we GET the current Airtable record and diff
 *     field-by-field. A value that pull just wrote already equals Airtable's, so
 *     the diff is empty and nothing is pushed. Only a genuine local divergence
 *     from Airtable's current value is written. This makes push idempotent and
 *     safe to run on every member's tab at once: identical upserts, last write
 *     wins, and a per-record field hash skips unchanged rows without a network
 *     call, so steady state is quiet.
 *
 * WHERE IT RUNS. Browser-only, same posture as the import + pull: the PAT is
 * passed to start() and held in memory for the life of the tab, sent only to
 * api.airtable.com. Nothing secret is persisted. Consequences: push advances only
 * while a tab is open, and the data endpoints must send CORS headers (they do).
 * For always-on push, run this same drain in the n8n relay with the token held
 * server-side — the translation core is transport-agnostic; only `atFetch` moves.
 *
 *   window.AirtablePush.start({ roomId, baseId, token, getState, emit, log
 *                             [, fetchImpl] })  // fetchImpl injectable for tests
 *   window.AirtablePush.stop()
 *   window.AirtablePush.flushNow()      // drain immediately (per-cycle otherwise)
 *   window.AirtablePush.status()        // { running, lastPush, lastError, pushed }
 *   window.AirtablePush.__test          // pure cores, for headless tests
 */

(function () {
  'use strict';

  const AT_BASE = 'https://api.airtable.com/v0';
  const PUSH_INTERVAL_MS = 15_000;   // mirror the pull cadence; well under 5 req/s
  const BATCH = 10;                   // Airtable write endpoints take ≤10 records/call
  const ORIGIN = 'airtable';
  const DELETED_PARTITION = '_deleted';
  // Computed / linked columns Airtable refuses writes to. The app's parsed schema
  // collapses every computed variant (createdTime, autoNumber, rollup, …) into
  // these, so this set is sufficient. `_`-prefixed keys are meta, always skipped.
  const SKIP_TYPES = new Set(['formula', 'rollup', 'linked', 'lookup', 'button', 'barcode']);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ── Authed fetch to Airtable, 429-aware (fetchImpl injectable for tests) ────
  async function atFetch(run, method, path, body) {
    const url = path.startsWith('http') ? path : AT_BASE + path;
    const doFetch = run.fetchImpl || fetch;
    for (let attempt = 0; attempt < 4; attempt++) {
      let res;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${run.token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch (e) {
        throw new Error('could not reach Airtable (api.airtable.com must be allowed)');
      }
      if (res.status === 429) { await sleep(30_000); continue; }
      if (res.status === 401) throw new Error('unauthorized — the token is invalid or expired');
      if (res.status === 403) throw new Error('forbidden — the token lacks data.records:write');
      if (res.status === 404) { const e = new Error('not found'); e.status = 404; throw e; }
      if (!res.ok) {
        let detail = '';
        try { const j = await res.json(); detail = j?.error?.message || j?.error?.type || j?.error || ''; } catch { /* ignore */ }
        const e = new Error(`Airtable ${res.status}${detail ? ' — ' + detail : ''}`);
        e.status = res.status;
        throw e;
      }
      if (res.status === 204) return null;
      return res.json();
    }
    throw new Error('Airtable rate limit — gave up after repeated 429s');
  }

  const recPath = (baseId, table) => `/${baseId}/${encodeURIComponent(table)}`;

  // ── Value coercion for a write (typecast:true also lets Airtable coerce) ────
  function coerce(type, v) {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;         // clear the cell
    switch (type) {
      case 'number': case 'duration': { const n = Number(v); return isNaN(n) ? null : n; }
      case 'boolean': return (v === true || /^(true|yes|y|1|checked|on)$/i.test(String(v)));
      case 'multiselect': return Array.isArray(v) ? v.map(String) : String(v).split(/[,;]/).map(s => s.trim()).filter(Boolean);
      case 'date': { const d = new Date(v); return isNaN(d.getTime()) ? String(v) : d.toISOString(); }
      default: return (typeof v === 'object') ? JSON.stringify(v) : String(v);
    }
  }

  // Field-type lookup from the already-folded schema (no network).
  function typeOf(state, setName, fieldName) {
    const fields = state?.schema?.fields?.[setName];
    if (!Array.isArray(fields)) return null;
    const f = fields.find(x => x && x.name === fieldName);
    return f ? f.type : null;
  }

  // The writable, name-keyed field object for an entity: its own non-meta fields,
  // minus computed/linked columns, each coerced. Undefined values drop out.
  function pushableFields(state, setName, entity) {
    const out = {};
    for (const k of Object.keys(entity || {})) {
      if (k.charCodeAt(0) === 95) continue;                 // `_meta`
      const type = typeOf(state, setName, k);
      if (type && SKIP_TYPES.has(type)) continue;           // computed / linked
      const cv = coerce(type, entity[k]);
      if (cv !== undefined) out[k] = cv;
    }
    return out;
  }

  // Sets this workspace imported from `baseId`, by name — the tables push watches.
  function airtableSetsFor(state, baseId) {
    const names = new Set();
    for (const e of Object.values(state?.entities || {})) {
      if (e?._type === 'import' && e.source === 'airtable' &&
          e.airtable_base === baseId && e.derived_set) names.add(e.derived_set);
    }
    return names;
  }

  const isDeleted = (state, anchor) => state?.partitions?.[anchor] === DELETED_PARTITION;

  // ── Pure planner: fold state → the write ops push should perform ────────────
  // Returns { creates, updates, deletes }. `updates`/`deletes` carry recordId;
  // `creates` carry the entity anchor so the caller can DEF the new id back.
  // Only entities in a watched Airtable set are considered; the cold import blob
  // (not in state.entities) is never touched.
  //
  // `myUserId` gates CREATES to the member who authored the row (the fold stamps
  // `_sender`): a new row has no upstream id and no idempotency key, so if every
  // member POSTed it we'd get duplicate Airtable records. Only its author creates
  // it; the returned id is then DEF'd back so everyone switches to the update
  // path. UPDATES and DELETES stay author-agnostic — they're keyed by recordId
  // and made idempotent by the GET-diff, so whoever gets there first wins and a
  // second writer is a harmless no-op (this also means an author's closed tab
  // doesn't strand an edit — any member with the token flushes it).
  function planCandidates(state, baseId, myUserId) {
    const sets = airtableSetsFor(state, baseId);
    const creates = [], updates = [], deletes = [];
    for (const anchor of Object.keys(state?.entities || {})) {
      const e = state.entities[anchor];
      if (!e || !sets.has(e._type)) continue;               // not a watched Airtable table
      const setName = e._type;
      const rid = e._recordId || null;
      if (isDeleted(state, anchor)) {
        if (rid) deletes.push({ anchor, recordId: rid, tableName: setName });
        continue;                                            // a blob-only delete has no upstream id
      }
      const fields = pushableFields(state, setName, e);
      if (rid) updates.push({ anchor, recordId: rid, tableName: setName, fields });
      else if (!myUserId || e._sender === myUserId) creates.push({ anchor, tableName: setName, fields });
    }
    return { creates, updates, deletes };
  }

  // Loose equality between a value we'd write and Airtable's current value, so
  // GET-diff doesn't PATCH a field that only differs by representation (number vs
  // numeric string, array order-insensitive for multiselect, empty vs missing).
  function sameValue(mine, theirs) {
    const em = mine === null || mine === undefined || mine === '';
    const et = theirs === null || theirs === undefined || theirs === '';
    if (em && et) return true;
    if (em !== et) return false;
    if (Array.isArray(mine) || Array.isArray(theirs)) {
      const a = (Array.isArray(mine) ? mine : [mine]).map(String).slice().sort();
      const b = (Array.isArray(theirs) ? theirs : [theirs]).map(String).slice().sort();
      return a.length === b.length && a.every((x, i) => x === b[i]);
    }
    if (typeof mine === 'number' || typeof theirs === 'number') return Number(mine) === Number(theirs);
    return String(mine) === String(theirs);
  }

  // Only the fields where our value genuinely differs from Airtable's current row
  // (`upstream` is Airtable's name-keyed `fields`). This is the pull→push echo
  // guard: a value pull wrote equals Airtable's, so it's dropped here.
  function changedFields(mine, upstream) {
    const out = {};
    const cur = upstream || {};
    for (const k of Object.keys(mine)) if (!sameValue(mine[k], cur[k])) out[k] = mine[k];
    return out;
  }

  // Stable hash of an entity's writable fields — skips a network round-trip for
  // rows unchanged since we last processed them.
  function hashFields(fields) {
    const keys = Object.keys(fields).sort();
    return JSON.stringify(keys.map(k => [k, fields[k]]));
  }

  // ── Engine ─────────────────────────────────────────────────────────────---
  let RUN = null;

  async function start(opts) {
    const { roomId, baseId, token, userId = null, getState, emit, log = () => {}, fetchImpl } = opts || {};
    if (!roomId || !baseId || !token || typeof getState !== 'function' || typeof emit !== 'function') {
      throw new Error('start needs { roomId, baseId, token, getState, emit }');
    }
    if (!window.MatrixEngine) throw new Error('engine.js must load before airtable-push.js');
    stop();
    const run = {
      roomId, baseId, token, userId, getState, emit, log, fetchImpl,
      timer: null, busy: false, stopped: false,
      lastPush: 0, lastError: null, pushed: 0,
      hashes: new Map(),   // recordId → last-processed field hash (skip unchanged)
      created: new Set(),  // anchors we've already POSTed this session (await id backfill)
    };
    RUN = run;
    run.timer = setInterval(() => drain(run), PUSH_INTERVAL_MS);
    // A first drain, deferred a tick so a burst of startup DEFs settles first.
    setTimeout(() => drain(run), 0);
    log(`push: draining local edits → ${baseId}`);
    return status();
  }

  function stop() {
    if (RUN?.timer) clearInterval(RUN.timer);
    if (RUN) RUN.stopped = true;
    RUN = null;
  }

  function status() {
    if (!RUN) return { running: false };
    return { running: true, baseId: RUN.baseId, lastPush: RUN.lastPush, lastError: RUN.lastError, pushed: RUN.pushed };
  }

  async function flushNow() {
    if (!RUN) throw new Error('push not running');
    await drain(RUN, true);
    return status();
  }

  async function drain(run, force) {
    if (run.stopped || run.busy) return;
    run.busy = true;
    try {
      const state = run.getState();
      const plan = planCandidates(state, run.baseId, run.userId);

      // 1. Creates — POST new rows (grouped by table, ≤10/call), then DEF the
      //    returned record id back so the entity becomes a first-class synced row
      //    (future edits UPDATE, and every member switches off the create path).
      const createByTable = new Map();
      for (const c of plan.creates) {
        if (run.created.has(c.anchor)) continue;           // already POSTed this session
        if (!createByTable.has(c.tableName)) createByTable.set(c.tableName, []);
        createByTable.get(c.tableName).push(c);
      }
      for (const [table, rows] of createByTable) {
        for (let i = 0; i < rows.length; i += BATCH) {
          const chunk = rows.slice(i, i + BATCH);
          for (const c of chunk) run.created.add(c.anchor);
          const body = { records: chunk.map(c => ({ fields: c.fields })), typecast: true };
          let res;
          try { res = await atFetch(run, 'POST', recPath(run.baseId, table), body); }
          catch (e) { for (const c of chunk) run.created.delete(c.anchor); throw e; }
          (res?.records || []).forEach((rec, k) => {
            const c = chunk[k];
            if (rec?.id && c) {
              run.emit(window.MatrixEngine.OP.DEF, { anchor: c.anchor, path: '_recordId', value: rec.id });
              run.emit(window.MatrixEngine.OP.DEF, { anchor: c.anchor, path: '_origin', value: ORIGIN });
              run.hashes.set(rec.id, hashFields(c.fields));
              run.pushed++;
            }
          });
        }
      }

      // 2. Updates — skip rows whose fields are unchanged since we last saw them;
      //    otherwise GET the record and PATCH only the fields that truly differ
      //    from Airtable's current value (the pull→push echo guard).
      const patchByTable = new Map();
      for (const u of plan.updates) {
        const h = hashFields(u.fields);
        if (!force && run.hashes.get(u.recordId) === h) continue;   // unchanged, no network
        let upstream = null;
        try { upstream = await atFetch(run, 'GET', recPath(run.baseId, u.tableName) + '/' + u.recordId); }
        catch (e) { if (e.status === 404) { run.hashes.set(u.recordId, h); continue; } throw e; }
        const diff = changedFields(u.fields, upstream?.fields || {});
        run.hashes.set(u.recordId, h);                              // processed either way
        if (!Object.keys(diff).length) continue;                    // echo / no real change
        if (!patchByTable.has(u.tableName)) patchByTable.set(u.tableName, []);
        patchByTable.get(u.tableName).push({ id: u.recordId, fields: diff });
      }
      for (const [table, recs] of patchByTable) {
        for (let i = 0; i < recs.length; i += BATCH) {
          const body = { records: recs.slice(i, i + BATCH), typecast: true };
          await atFetch(run, 'PATCH', recPath(run.baseId, table), body);
          run.pushed += Math.min(BATCH, recs.length - i);
        }
      }

      // 3. Deletes — tombstoned rows that still exist upstream.
      const delByTable = new Map();
      for (const d of plan.deletes) {
        if (!delByTable.has(d.tableName)) delByTable.set(d.tableName, []);
        delByTable.get(d.tableName).push(d.recordId);
      }
      for (const [table, ids] of delByTable) {
        for (let i = 0; i < ids.length; i += BATCH) {
          const q = ids.slice(i, i + BATCH).map(id => `records[]=${encodeURIComponent(id)}`).join('&');
          try { await atFetch(run, 'DELETE', recPath(run.baseId, table) + '?' + q); run.pushed += Math.min(BATCH, ids.length - i); }
          catch (e) { if (e.status !== 404) throw e; }   // already gone upstream — fine
          for (const id of ids.slice(i, i + BATCH)) run.hashes.delete(id);
        }
      }

      run.lastPush = Date.now();
      run.lastError = null;
    } catch (e) {
      run.lastError = e.message;
      run.log('push error: ' + e.message);
    } finally {
      run.busy = false;
    }
  }

  window.AirtablePush = {
    start, stop, flushNow, status,
    __test: { planCandidates, pushableFields, coerce, changedFields, sameValue, airtableSetsFor },
  };
})();
