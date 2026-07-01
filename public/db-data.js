/* db-data.js — the Database view's data engine, vendored from bare-metal-eo.
 *
 * AMINO's Database grid used to be hand-rolled (a hardcoded 3-table `dbTables()`
 * that only ever projected the "Client Info" set). That re-derivation is exactly
 * what drifted from the real backend and showed 0 / wrong records. This module
 * instead lifts bare-metal's PROVEN derivation VERBATIM so the skin renders the
 * same tables/columns/rows/links bare-metal does:
 *
 *   • inferType / buildTable / linkedTypesFor / linksFromAnchor
 *        ← bare-metal-eo  public/table-view.jsx
 *   • augmentState (materialized import rows + _linkRefs→connections + airtable
 *     shadow) and listSets (the per-set "should have N / local M" table list)
 *        ← bare-metal-eo  public/app.jsx  (renderState + syncTables memos)
 *
 * Keep these in sync with bare-metal: they are pure functions copied across, not
 * a parallel implementation. Presentation (icons, chip colors, the cream theme)
 * stays in ui/amino-app.js — this file is data only.
 *
 * Exposes window.AminoDB.
 */
(function () {
  // ── inferType ── (table-view.jsx) — guess a column's SQL-ish type from data.
  function inferType(values) {
    const defined = values.filter(v => v !== undefined && v !== null && v !== '');
    if (defined.length === 0) return 'text';
    if (defined.every(v => typeof v === 'number' || (!isNaN(parseFloat(v)) && isFinite(v)))) return 'number';
    if (defined.every(v => typeof v === 'boolean')) return 'boolean';
    if (defined.every(v => typeof v === 'string')) {
      const distinct = new Set(defined);
      if (distinct.size <= 5 && distinct.size < defined.length * 0.7) return 'select';
      return 'text';
    }
    return 'json';
  }

  // ── buildTable ── (table-view.jsx) — schema-driven columns (in declared order,
  // with type/options), then any data-only columns appended as "unschematized".
  // rows = every entity of this _type in the (augmented) state.
  function buildTable(entityType, state) {
    const rows = Object.values(state.entities).filter(e => e._type === entityType);
    const schemaFields = state.schema && state.schema.fields && state.schema.fields[entityType];
    let cols;
    if (Array.isArray(schemaFields)) {
      const declared = new Set(schemaFields.map(f => f.name));
      cols = schemaFields.map(f => ({ name: f.name, type: f.type, options: f.options, optionColors: f.optionColors, formula: f.formula, rollup: f.rollup, schematized: true }));
      const extras = new Set();
      for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith('_') && !declared.has(k)) extras.add(k);
      for (const name of extras) cols.push({ name, type: inferType(rows.map(r => r[name])), schematized: false });
    } else {
      const colSet = new Set();
      for (const r of rows) for (const k of Object.keys(r)) if (!k.startsWith('_')) colSet.add(k);
      cols = Array.from(colSet).map(name => ({ name, type: inferType(rows.map(r => r[name])), schematized: false }));
    }
    const hasPartitionInSchema = !!(state.schema && state.schema.partitions && state.schema.partitions[entityType]);
    const partitioned = hasPartitionInSchema || rows.some(r => state.partitions[r._anchor]);
    return { cols, rows, partitioned, partitionFromSchema: hasPartitionInSchema };
  }

  // ── tableFromStore ── the O(window) path: buildTable as a thin adapter over
  // AminoRowStore.query() instead of Object.values(state.entities).filter. Same
  // column derivation as buildTable (declared schema fields in order, then
  // data-only "extras" appended), but columns come from the store's complete
  // field list and rows are just the requested page — never a full-set scan.
  // Returns { cols, rows, total, hasMore, groups } for the grid. `schemaFields`
  // is state.schema.fields[setName] (may be undefined). `opts` is passed through
  // to query(): { filter, sort, group, search, offset, limit }.
  function tableFromStore(store, setName, schemaFields, opts) {
    opts = opts || {};
    const allFields = store.fieldList(setName);
    // Infer types from a bounded sample page (windowed, not a full scan).
    const sample = store.query(setName, { limit: opts.sampleSize || 200 }).page;
    const typeOf = name => inferType(sample.map(r => r[name]));
    let cols;
    if (Array.isArray(schemaFields)) {
      const declared = new Set(schemaFields.map(f => f.name));
      cols = schemaFields.map(f => ({ name: f.name, type: f.type, options: f.options, optionColors: f.optionColors, formula: f.formula, rollup: f.rollup, schematized: true }));
      for (const name of allFields) if (!declared.has(name)) cols.push({ name, type: typeOf(name), schematized: false });
    } else {
      cols = allFields.map(name => ({ name, type: typeOf(name), schematized: false }));
    }
    const res = store.query(setName, opts);
    const offset = Math.max(0, opts.offset | 0);
    return { cols, rows: res.page, total: res.total, hasMore: (offset + res.page.length) < res.total, groups: res.groups };
  }

  // ── linkedTypesFor / linksFromAnchor ── (table-view.jsx) — relational joins,
  // preferring declared schema.links, falling back to observed CON edges.
  function linkedTypesFor(entityType, state) {
    const schemaLinks = state.schema && state.schema.links;
    if (Array.isArray(schemaLinks)) {
      const set = new Set();
      for (const l of schemaLinks) {
        if (l.from === entityType) set.add(l.to);
        if (l.to === entityType) set.add(l.from);
      }
      return Array.from(set);
    }
    const set = new Set();
    for (const c of state.connections) {
      const src = state.entities[c.source];
      const tgt = state.entities[c.target];
      if (src && src._type === entityType && tgt) set.add(tgt._type);
      if (tgt && tgt._type === entityType && src) set.add(src._type);
    }
    return Array.from(set);
  }

  function linksFromAnchor(anchor, otherType, state) {
    const out = [];
    const label = (e, fallback) => (e.Name || e.title || e.body || e.claim || e.what ||
      (e['Family Name'] ? (e['Family Name'] + ', ' + (e['First Name'] || '')) : null) || fallback);
    for (const c of state.connections) {
      if (c.source === anchor) {
        const tgt = state.entities[c.target];
        if (tgt && tgt._type === otherType) out.push({ anchor: c.target, label: label(tgt, c.target.slice(-8)), rel: c.type, type: otherType, dir: 'out' });
      } else if (c.target === anchor) {
        const src = state.entities[c.source];
        if (src && src._type === otherType) out.push({ anchor: c.source, label: label(src, c.source.slice(-8)), rel: c.type, type: otherType, dir: 'in' });
      }
    }
    return out;
  }

  // The active (newest) generation of each re-synced import. Delegates to the
  // row materializer's activeImports (import_group / monotonic import_seq).
  function activeImports(imports) {
    const AR = window.AminoRows;
    if (AR && AR.activeImports) return AR.activeImports(imports);
    return imports;
  }

  function importEntitiesOf(state) {
    return Object.values((state && state.entities) || {}).filter(
      e => e && e._type === 'import' && e.derived_set && Array.isArray(e.field_plan)
    );
  }

  // Anchors of the active import entities — the set whose materialized blob rows
  // are allowed to inject (a superseded re-sync's cached rows must not duplicate).
  function activeImportAnchors(state) {
    return new Set(activeImports(importEntitiesOf(state)).map(e => e._anchor));
  }

  // ── augmentState ── (app.jsx renderState) — the state the grid actually reads:
  // fold(events) + materialized import rows (typed by derived_set) + CON edges
  // synthesized from each row's _linkRefs + the Airtable shadow reconciliation.
  // `importRowsByAnchor` = { [importAnchor]: row[] } (from AminoRows). `activeSet`
  // = activeImportAnchors(state). Returns a NEW state; never mutates the fold.
  function augmentState(state, importRowsByAnchor, activeSet) {
    const byAnchor = importRowsByAnchor || {};
    const active = activeSet || activeImportAnchors(state);
    const anchors = Object.keys(byAnchor).filter(a => state.entities && state.entities[a] && active.has(a));

    // Airtable inbound-sync entities SHADOW the cold blob row with the same
    // _recordId (edited row wins, shown once); a _deleted partition hides both.
    const atShadow = new Map();
    for (const e of Object.values(state.entities || {})) {
      if (e && e._origin === 'airtable' && e._recordId != null) {
        const deleted = e._partition === '_deleted' || (state.partitions && state.partitions[e._anchor] === '_deleted');
        atShadow.set(e._recordId, deleted);
      }
    }

    if (!anchors.length && !atShadow.size) return state;

    const entities = {};
    for (const a of anchors) for (const row of byAnchor[a]) entities[row._anchor] = row;
    Object.assign(entities, state.entities);

    // Resolve record-link fields into connections via a record-id → anchor index.
    let connections = state.connections;
    const idIndex = new Map();
    let hasLinkRefs = false;
    for (const a of anchors) {
      for (const row of byAnchor[a]) {
        if (row._recordId) idIndex.set(row._recordId, row._anchor);
        if (row._linkRefs) hasLinkRefs = true;
      }
    }
    if (hasLinkRefs && idIndex.size) {
      const derived = [];
      const seen = new Set();
      for (const a of anchors) {
        for (const row of byAnchor[a]) {
          const refs = row._linkRefs;
          if (!refs) continue;
          for (const field of Object.keys(refs)) {
            const { rel, ids } = refs[field];
            for (const id of ids) {
              const target = idIndex.get(id);
              if (!target || target === row._anchor) continue;
              const key = row._anchor + '|' + target + '|' + (rel || field);
              if (seen.has(key)) continue;
              seen.add(key);
              derived.push({ source: row._anchor, target, type: rel || field, _derived: 'airtable' });
            }
          }
        }
      }
      if (derived.length) connections = state.connections.concat(derived);
    }

    if (atShadow.size) {
      for (const key of Object.keys(entities)) {
        const e = entities[key];
        const rid = e && e._recordId;
        if (rid == null || !atShadow.has(rid)) continue;
        if (atShadow.get(rid)) delete entities[key];
        else if (e._origin !== 'airtable') delete entities[key];
      }
    }

    return Object.assign({}, state, { entities, connections });
  }

  // ── listSets ── (app.jsx syncTables) — every table this workspace knows about:
  // declared schema.tables ∪ every distinct entity _type ∪ every import's
  // derived_set (minus internal `_*` types and the `import` carrier itself).
  // `expected` is the import-time row total (folds immediately, before the blob
  // streams in); `localRows` is what's actually materialized on this device.
  function listSets(state, renderState) {
    const rs = renderState || state;
    const declared = (state.schema && state.schema.tables) || [];
    const imports = importEntitiesOf(state);
    const names = Array.from(new Set([
      ...declared,
      ...Object.values(state.entities || {}).map(e => e._type),
      ...imports.map(e => e.derived_set),
    ])).filter(n => n && !n.startsWith('_') && n !== 'import');

    const rowsByType = {};
    for (const e of Object.values(rs.entities || {})) if (e._type) rowsByType[e._type] = (rowsByType[e._type] || 0) + 1;

    return names.map(name => {
      const imps = imports.filter(e => e.derived_set === name);
      const isImport = imps.length > 0;
      const expectedImported = imps.reduce((s, e) => s + (e.rows_imported || 0), 0);
      const localRows = rowsByType[name] || 0;
      return {
        name,
        localRows,
        expected: isImport ? Math.max(expectedImported, localRows) : localRows,
        isImport,
        chunksTotal: imps.length,
        declared: declared.includes(name),
      };
    }).sort((a, b) => (b.expected - a.expected) || a.name.localeCompare(b.name));
  }

  window.AminoDB = {
    inferType, buildTable, tableFromStore, linkedTypesFor, linksFromAnchor,
    augmentState, listSets, activeImportAnchors, importEntitiesOf,
  };
})();
