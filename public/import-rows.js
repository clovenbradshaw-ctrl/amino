/* import-rows.js — materialize lazily-stored import set rows.
 *
 * The foundation stores a CSV/JSON/Airtable import as a single "import" entity
 * (_type:'import') carrying a media `file` ref + a `field_plan` + `derived_set`
 * name. The thousands of rows are NOT events — they live in the uploaded blob
 * and are reconstructed on read. This is the read side, ported verbatim from
 * bare-metal's csv-import.jsx so AMINO can project the SAME data bare-metal
 * imported (clients, cases, notes) into its CRM.
 *
 * Exposes window.AminoRows = { materializeImportRows, importsForSet,
 * activeImports, parseCSV, coerce }.
 */
(function () {
  // ── CSV parser (RFC 4180-ish; quoted "" → ") ──
  function parseCSV(text) {
    const rows = [];
    let row = [], cur = '', inQ = false, started = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else {
        if (ch === '"' && !started) { inQ = true; started = true; }
        else if (ch === ',') { row.push(cur); cur = ''; started = false; }
        else if (ch === '\r') { /* swallow */ }
        else if (ch === '\n') { row.push(cur); cur = ''; started = false; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
        else { cur += ch; started = true; }
      }
    }
    if (cur !== '' || row.length) { row.push(cur); if (row.length > 1 || row[0] !== '') rows.push(row); }
    return rows;
  }

  function coerce(value, type) {
    if (value == null || value === '') return undefined;
    if (type === 'number')  { const n = parseFloat(value); return isNaN(n) ? value : n; }
    if (type === 'boolean') { return /^(true|yes|y|1)$/i.test(value); }
    if (type === 'date')    { const d = Date.parse(value); return isNaN(d) ? value : new Date(d).toISOString(); }
    return String(value);
  }

  // Minimal JSON dataset parser (mirrors src/dataset.js parseJsonDataset).
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

  function coerceJsonValue(value, type) {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'object') return value;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    return coerce(value, type);
  }

  const importRowCache = new Map();

  async function materializeImportRows(importEntity) {
    if (!importEntity || !importEntity._anchor) return null;
    const cached = importRowCache.get(importEntity._anchor);
    if (cached) return cached;

    const ML = window.MatrixLive;
    const ref = importEntity.file;
    const fieldPlan = importEntity.field_plan;
    const setName = importEntity.derived_set;
    // `file` is DEF'd after the INS, so right after a refresh the ref may not
    // have folded in yet — return null (not []) so the import stays retryable.
    if (!ML || !ML.readMedia || !ref || !Array.isArray(fieldPlan) || !setName) return null;

    let bytes;
    try { bytes = await ML.readMedia(ref); }
    catch (e) { console.warn('[import-rows] could not read source blob:', e); return null; }
    if (!bytes) return null;

    let text;
    if (typeof bytes === 'string')         text = bytes;
    else if (bytes instanceof Blob)        text = await bytes.text();
    else if (bytes instanceof Uint8Array)  text = new TextDecoder().decode(bytes);
    else if (bytes instanceof ArrayBuffer) text = new TextDecoder().decode(new Uint8Array(bytes));
    else                                   return null;

    const isJson = importEntity.shape === 'json';
    let dataRows;
    if (isJson) {
      try { dataRows = parseJsonRows(text); }
      catch (e) { console.warn('[import-rows] json parse failed:', e); return null; }
    } else {
      let parsed;
      try { parsed = parseCSV(text); }
      catch (e) { console.warn('[import-rows] parse failed:', e); return null; }
      if (!Array.isArray(parsed) || parsed.length === 0) { importRowCache.set(importEntity._anchor, []); return []; }
      const hasHeader = importEntity.has_header !== false;
      dataRows = hasHeader ? parsed.slice(1) : parsed;
    }
    if (!Array.isArray(dataRows) || dataRows.length === 0) { importRowCache.set(importEntity._anchor, []); return []; }

    const rows = dataRows.map((raw, i) => {
      const out = {
        _anchor: `${importEntity._anchor}#r${i}`,
        _type: setName,
        _created: importEntity._created,
        _sender: importEntity._sender,
        _eventId: importEntity._eventId,
        _hwm: 2,
        _materialized: importEntity._anchor,
      };
      for (const f of fieldPlan) {
        // Link fields hold arrays of foreign record ids → resolved into CON
        // edges once every table is indexed. Stash in a hidden _linkRefs map.
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
    });

    importRowCache.set(importEntity._anchor, rows);
    return rows;
  }

  // Collapse re-syncs to their newest generation (stable import_group, monotonic
  // import_seq). One-off imports have no group and always pass through.
  function activeImports(imports) {
    const maxSeq = new Map();
    for (const e of imports) {
      if (!e || !e.import_group) continue;
      const seq = e.import_seq || 0;
      if (!maxSeq.has(e.import_group) || seq > maxSeq.get(e.import_group)) maxSeq.set(e.import_group, seq);
    }
    return imports.filter(e => !e || !e.import_group || (e.import_seq || 0) === maxSeq.get(e.import_group));
  }

  // Import entities whose derived set matches `entityType` (newest generation).
  function importsForSet(state, entityType) {
    if (!state || !state.entities || !entityType) return [];
    const all = Object.values(state.entities).filter(
      e => e && e._type === 'import' && e.derived_set === entityType && Array.isArray(e.field_plan)
    );
    return activeImports(all);
  }

  window.AminoRows = { materializeImportRows, importsForSet, activeImports, parseCSV, coerce };
})();
