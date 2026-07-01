/* rows-materialize.js — pure, worker-safe parse + materialize (SCALING.md Phase 1).
 *
 * The heavy part of importing a set — turning a CSV/JSON blob into typed row
 * objects — with NO DOM and NO Matrix dependency, so it can run inside
 * public/rows.worker.js off the main thread. The main thread only reads +
 * decrypts the media blob (needs the vault/keys) and hands the text here.
 *
 * A chunked/streaming CSV parser (feed it the blob in pieces, or all at once)
 * emits rows in batches instead of building one giant array — so a huge set
 * fills in progressively instead of freezing the tab.
 *
 * The row mapping mirrors public/import-rows.js `materializeImportRows` VERBATIM
 * (same _anchor / _type / field_plan handling, same _linkRefs stashing) so the
 * output is byte-for-byte substitutable into db-data.js augmentState and the row
 * store. Keep the two in sync — they are the same derivation in two homes (like
 * db-data.js ↔ bare-metal). Exposes window.AminoMaterialize (also self.* in a
 * worker).
 */
(function (root) {
  'use strict';

  // ── coercion (mirrors import-rows.js coerce / coerceJsonValue) ──
  function coerce(value, type) {
    if (value == null || value === '') return undefined;
    if (type === 'number')  { const n = parseFloat(value); return isNaN(n) ? value : n; }
    if (type === 'boolean') { return /^(true|yes|y|1)$/i.test(value); }
    if (type === 'date')    { const d = Date.parse(value); return isNaN(d) ? value : new Date(d).toISOString(); }
    return String(value);
  }
  function coerceJsonValue(value, type) {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'object') return value;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    return coerce(value, type);
  }

  // ── streaming CSV parser (RFC 4180-ish; quoted "" → ") ──
  // A push/end state machine so the caller can feed chunks from a ReadableStream
  // (true streaming) or the whole string at once. onRow(fields[]) per complete
  // record; the machine never holds more than the row being assembled.
  function createCSVParser(onRow) {
    let row = [], cur = '', inQ = false, started = false;
    function push(text) {
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inQ) {
          if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
          else cur += ch;
        } else {
          if (ch === '"' && !started) { inQ = true; started = true; }
          else if (ch === ',') { row.push(cur); cur = ''; started = false; }
          else if (ch === '\r') { /* swallow */ }
          else if (ch === '\n') { row.push(cur); cur = ''; started = false; if (row.length > 1 || row[0] !== '') onRow(row); row = []; }
          else { cur += ch; started = true; }
        }
      }
    }
    function end() {
      if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') onRow(row); }
      row = []; cur = ''; started = false;
    }
    return { push, end };
  }

  // Minimal JSON dataset parser (mirrors import-rows.js parseJsonRows).
  function parseJsonRows(text) {
    const data = JSON.parse(text);
    const isRowObj = v => v && typeof v === 'object' && !Array.isArray(v);
    if (Array.isArray(data)) {
      if (data.length === 0) return [];
      if (isRowObj(data[0])) return data;
      return data.map(v => ({ value: v }));
    }
    if (data && typeof data === 'object') {
      for (const k of Object.keys(data)) {
        const v = data[k];
        if (Array.isArray(v) && v.length > 0 && isRowObj(v[0])) return v;
      }
      return [data];
    }
    return [{ value: data }];
  }

  // Map one raw record (CSV array or JSON object) to a materialized row, exactly
  // as import-rows.js does. `i` is the row's ordinal within the import.
  function mapRow(raw, i, opts) {
    const { fieldPlan, setName, shape, importAnchor, created, sender, eventId } = opts;
    const isJson = shape === 'json';
    const out = {
      _anchor: `${importAnchor}#r${i}`,
      _type: setName,
      _created: created,
      _sender: sender,
      _eventId: eventId,
      _hwm: 2,
      _materialized: importAnchor,
    };
    for (const f of fieldPlan) {
      if (f.link) {
        const ids = raw && raw[f.jsonKey];
        if (Array.isArray(ids) && ids.length) {
          if (!out._linkRefs) out._linkRefs = {};
          out._linkRefs[f.name] = { to: f.link.to, rel: f.link.rel || f.name, ids: ids.map(String) };
        }
        continue;
      }
      const v = isJson ? coerceJsonValue(raw && raw[f.jsonKey], f.type) : coerce(raw[f.csvIdx], f.type);
      if (v !== undefined && v !== null && v !== '') out[f.name] = v;
    }
    return out;
  }

  // Materialize an entire blob's text into typed rows, emitting batches.
  //   opts: { fieldPlan, setName, shape:'csv'|'json', hasHeader, importAnchor,
  //           created, sender, eventId, batchSize }
  //   onBatch(rows[])   called per batch (default batch size 5000)
  //   returns total row count
  function materialize(text, opts, onBatch) {
    const batchSize = opts.batchSize || 5000;
    let batch = [], i = 0;
    const flush = () => { if (batch.length) { onBatch(batch); batch = []; } };
    const emit = row => { batch.push(row); if (batch.length >= batchSize) flush(); };

    if (opts.shape === 'json') {
      const dataRows = parseJsonRows(text);
      for (const raw of dataRows) emit(mapRow(raw, i++, opts));
    } else {
      const hasHeader = opts.hasHeader !== false;
      let seenHeader = false;
      const parser = createCSVParser(fields => {
        if (hasHeader && !seenHeader) { seenHeader = true; return; } // skip the header record
        emit(mapRow(fields, i++, opts));
      });
      parser.push(text);
      parser.end();
    }
    flush();
    return i;
  }

  root.AminoMaterialize = { materialize, createCSVParser, parseJsonRows, mapRow, coerce, coerceJsonValue };
})(typeof self !== 'undefined' ? self : this);
