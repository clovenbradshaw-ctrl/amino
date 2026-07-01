/* row-store.js — the query spine (BUILD-PLAN.md / SCALING.md Phase 1).
 *
 * A columnar, per-set row store with a single query() entry point. Everything a
 * view needs — filter, sort, group, search, hide-fields, pagination — is a
 * preset of this one call, and "no slowdown at 1M" is a property of the store it
 * runs against. The grid, kanban, calendar and gallery are all thin renderers
 * over query(); nothing above the store iterates the full set again.
 *
 *   store.loadSet(name, rows[, {fields}])   // ingest materialized rows, columnar
 *   store.count(name)                        // O(1), maintained on load
 *   store.query(name, {
 *     filter,   // predicate tree: {op:'and'|'or'|'not', clauses:[...]} | leaf {field, op, value}
 *     sort,     // [{field, dir:'asc'|'desc'}]  (multi-key, stable)
 *     group,    // {field}          → groups:[{key, count}] over the filtered set
 *     search,   // free text (linear scan today; inverted index is Phase 5)
 *     fields,   // visible columns  (page rows keep these + all _meta fields)
 *     offset, limit,
 *     now,      // reference time for relative date ops (defaults to Date.now())
 *   }) -> { page: Row[], total: number, groups?: {key, count}[] }
 *
 * Columnar storage (one array per field, not N heap objects per row) keeps
 * per-column scans cache-friendly and is the seam Phase 5 swings to indexed
 * columns / OPFS persistence without touching callers. Rows never enter
 * state.entities; memory scales with a set's columns + one page of rows.
 *
 * Zero-dependency, no DOM: exposes window.AminoRowStore = { create, compileFilter,
 * OPERATORS }. Loaded headless in test/row-store.test.mjs.
 */
(function () {
  'use strict';

  // ── value coercion helpers ──
  const isEmpty = v => v === undefined || v === null || v === '';
  const toNum = v => {
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))) return Number(v);
    return NaN;
  };
  const toTime = v => {
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    const t = Date.parse(v);
    return isNaN(t) ? NaN : t;
  };
  const strOf = v => (v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  const ciEq = (a, b) => strOf(a).trim().toLowerCase() === strOf(b).trim().toLowerCase();
  // A multiselect cell is an array, or a comma/semicolon-joined string.
  const asArray = v => {
    if (Array.isArray(v)) return v.map(strOf);
    if (isEmpty(v)) return [];
    return strOf(v).split(/[,;]/).map(s => s.trim()).filter(Boolean);
  };
  const asList = v => (Array.isArray(v) ? v : [v]); // normalize a filter operand to a list

  // Relative date window for `within`: value = {n, unit:'day'|'week'|'month', dir:'last'|'next'}.
  const MS = { day: 86400000, week: 604800000, month: 2629800000 };
  function withinRange(spec, now) {
    const n = Number(spec && spec.n) || 0;
    const span = (MS[spec && spec.unit] || MS.day) * n;
    return (spec && spec.dir === 'next') ? [now, now + span] : [now - span, now];
  }

  // ── operator registry ──
  // Each op is (cell, operand, ctx) -> boolean. Canonical keys plus the
  // Airtable-style labels from BUILD-PLAN.md so a UI can pass either.
  const OPERATORS = {
    // text / general
    is:            (c, v) => ciEq(c, v),
    isNot:         (c, v) => !ciEq(c, v),
    contains:      (c, v) => strOf(c).toLowerCase().includes(strOf(v).toLowerCase()),
    notContains:   (c, v) => !strOf(c).toLowerCase().includes(strOf(v).toLowerCase()),
    isEmpty:       (c)    => isEmpty(c) || (Array.isArray(c) && c.length === 0),
    isNotEmpty:    (c)    => !(isEmpty(c) || (Array.isArray(c) && c.length === 0)),
    // number
    eq:            (c, v) => toNum(c) === toNum(v),
    ne:            (c, v) => toNum(c) !== toNum(v),
    gt:            (c, v) => toNum(c) >  toNum(v),
    lt:            (c, v) => toNum(c) <  toNum(v),
    gte:           (c, v) => toNum(c) >= toNum(v),
    lte:           (c, v) => toNum(c) <= toNum(v),
    between:       (c, v) => { const n = toNum(c), [a, b] = asList(v).map(toNum); return n >= Math.min(a, b) && n <= Math.max(a, b); },
    // select (single)
    isAnyOf:       (c, v) => asList(v).some(x => ciEq(c, x)),
    isNoneOf:      (c, v) => !asList(v).some(x => ciEq(c, x)),
    // multiselect
    hasAnyOf:      (c, v) => { const cell = asArray(c).map(s => s.toLowerCase()); return asList(v).some(x => cell.includes(strOf(x).toLowerCase())); },
    hasAllOf:      (c, v) => { const cell = asArray(c).map(s => s.toLowerCase()); return asList(v).every(x => cell.includes(strOf(x).toLowerCase())); },
    hasNoneOf:     (c, v) => { const cell = asArray(c).map(s => s.toLowerCase()); return !asList(v).some(x => cell.includes(strOf(x).toLowerCase())); },
    // date
    dateIs:        (c, v) => { const a = toTime(c), b = toTime(v); return !isNaN(a) && !isNaN(b) && a === b; },
    before:        (c, v) => { const a = toTime(c), b = toTime(v); return !isNaN(a) && !isNaN(b) && a <  b; },
    after:         (c, v) => { const a = toTime(c), b = toTime(v); return !isNaN(a) && !isNaN(b) && a >  b; },
    onOrBefore:    (c, v) => { const a = toTime(c), b = toTime(v); return !isNaN(a) && !isNaN(b) && a <= b; },
    onOrAfter:     (c, v) => { const a = toTime(c), b = toTime(v); return !isNaN(a) && !isNaN(b) && a >= b; },
    within:        (c, v, ctx) => { const t = toTime(c); if (isNaN(t)) return false; const [lo, hi] = withinRange(v, ctx.now); return t >= lo && t <= hi; },
    // boolean
    isChecked:     (c) => c === true || /^(true|yes|y|1)$/i.test(strOf(c)),
    isUnchecked:   (c) => !(c === true || /^(true|yes|y|1)$/i.test(strOf(c))),
  };
  // Airtable-label aliases → canonical keys.
  const ALIASES = {
    'is not': 'isNot', 'does not contain': 'notContains', 'is empty': 'isEmpty',
    'is not empty': 'isNotEmpty', '=': 'eq', '≠': 'ne', '>': 'gt', '<': 'lt',
    '≥': 'gte', '≤': 'lte', 'is any of': 'isAnyOf', 'is none of': 'isNoneOf',
    'has any of': 'hasAnyOf', 'has all of': 'hasAllOf', 'has none of': 'hasNoneOf',
  };
  const resolveOp = name => OPERATORS[name] || OPERATORS[ALIASES[name]] || null;

  // ── compile a predicate tree into a single row test ──
  // Leaf: {field, op, value}. Node: {op:'and'|'or'|'not', clauses:[...]}.
  function compileFilter(node) {
    if (!node) return () => true;
    const kind = String(node.op || '').toLowerCase();
    if (kind === 'and' || kind === 'or' || kind === 'not') {
      const kids = (node.clauses || []).map(compileFilter);
      if (kind === 'and') return row => kids.every(k => k(row));
      if (kind === 'or')  return row => kids.some(k => k(row));
      return row => !kids.every(k => k(row)); // not = negate the AND of clauses
    }
    // leaf
    const fn = resolveOp(node.op);
    if (!fn) throw new Error('row-store: unknown filter operator: ' + node.op);
    const field = node.field, value = node.value;
    return row => { try { return !!fn(row[field], value, node._ctx || {}); } catch { return false; } };
  }

  // Type-aware comparator for a single sort key. Numbers < numbers, times <
  // times, else case-insensitive string compare. Empty sorts last.
  function compareValues(a, b) {
    const ae = isEmpty(a), be = isEmpty(b);
    if (ae && be) return 0;
    if (ae) return 1;
    if (be) return -1;
    const na = toNum(a), nb = toNum(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    const ta = toTime(a), tb = toTime(b);
    if (!isNaN(ta) && !isNaN(tb)) return ta - tb;
    return strOf(a).toLowerCase().localeCompare(strOf(b).toLowerCase());
  }

  // ── the store ──
  function create() {
    const sets = new Map(); // name -> { fields, columns:Map, meta:[], n }

    function loadSet(name, rows, opts) {
      rows = Array.isArray(rows) ? rows : [];
      const fieldOrder = (opts && opts.fields) ? opts.fields.slice() : [];
      const seen = new Set(fieldOrder);
      const columns = new Map();
      for (const f of fieldOrder) columns.set(f, []);
      const meta = [];
      let i = 0;
      for (const r of rows) {
        const m = {};
        for (const k in r) {
          if (k.charCodeAt(0) === 95 /* '_' */) { m[k] = r[k]; continue; } // hidden meta field
          if (!seen.has(k)) { seen.add(k); fieldOrder.push(k); columns.set(k, []); }
        }
        for (const f of fieldOrder) { const col = columns.get(f); col[i] = r[f]; }
        meta[i] = m;
        i++;
      }
      sets.set(name, { fields: fieldOrder, columns, meta, n: rows.length });
      return sets.get(name);
    }

    const has = name => sets.has(name);
    const setNames = () => Array.from(sets.keys());
    const count = name => { const s = sets.get(name); return s ? s.n : 0; };
    // The complete column list of a set (every non-_ field seen at load), in
    // first-seen order — the whole domain of columns, independent of any window.
    const fieldList = name => { const s = sets.get(name); return s ? s.fields.slice() : []; };

    // Reconstruct row i of a set from its columns + meta (the only place a full
    // row object is built — and only for the requested window).
    function rowAt(s, i, fields) {
      const out = Object.assign({}, s.meta[i]);
      const cols = fields || s.fields;
      for (const f of cols) { const col = s.columns.get(f); if (col) out[f] = col[i]; }
      return out;
    }

    function query(name, opts) {
      opts = opts || {};
      const s = sets.get(name);
      if (!s) return { page: [], total: 0 };
      const now = opts.now != null ? opts.now : Date.now();

      // 1. filter → matching row indices (thread `now` onto leaves for date ops)
      const test = opts.filter ? compileFilter(injectNow(opts.filter, now)) : null;
      let idx = [];
      const searchNeedle = opts.search ? String(opts.search).toLowerCase() : '';
      const searchFields = opts.searchFields || s.fields;
      for (let i = 0; i < s.n; i++) {
        if (test) { const row = rowAt(s, i); if (!test(row)) continue; }
        if (searchNeedle && !rowMatchesSearch(s, i, searchFields, searchNeedle)) continue;
        idx.push(i);
      }
      const total = idx.length;

      // 2. group counts over the filtered set (kanban / grouped grid)
      let groups;
      if (opts.group && opts.group.field) {
        const gf = opts.group.field, col = s.columns.get(gf);
        const tally = new Map();
        for (const i of idx) {
          const key = col ? (isEmpty(col[i]) ? '(empty)' : strOf(col[i])) : '(empty)';
          tally.set(key, (tally.get(key) || 0) + 1);
        }
        groups = Array.from(tally, ([key, c]) => ({ key, count: c }))
          .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key));
      }

      // 3. multi-key stable sort
      if (Array.isArray(opts.sort) && opts.sort.length) {
        const keys = opts.sort;
        idx = idx
          .map((i, ord) => ({ i, ord }))
          .sort((A, B) => {
            for (const k of keys) {
              const col = s.columns.get(k.field);
              const c = compareValues(col ? col[A.i] : undefined, col ? col[B.i] : undefined);
              if (c) return k.dir === 'desc' ? -c : c;
            }
            return A.ord - B.ord; // stable
          })
          .map(x => x.i);
      }

      // 4. window + project visible fields
      const offset = Math.max(0, opts.offset | 0);
      const limit = opts.limit != null ? Math.max(0, opts.limit | 0) : total;
      const fields = Array.isArray(opts.fields) ? opts.fields : null;
      const page = [];
      for (let k = offset; k < Math.min(offset + limit, idx.length); k++) page.push(rowAt(s, idx[k], fields));

      const res = { page, total };
      if (groups) res.groups = groups;
      return res;
    }

    function rowMatchesSearch(s, i, fields, needle) {
      for (const f of fields) {
        const col = s.columns.get(f);
        if (col && strOf(col[i]).toLowerCase().includes(needle)) return true;
      }
      return false;
    }

    return { loadSet, query, count, has, setNames, fieldList, rowAt: (name, i, fields) => { const s = sets.get(name); return s ? rowAt(s, i, fields) : null; } };
  }

  // `within` needs `now` at eval time; thread it onto every leaf's ctx by
  // recompiling a shallow-cloned tree that carries _ctx. (Kept simple: the leaf
  // compiler reads node._ctx.now.)
  function injectNow(node, now) {
    if (!node) return node;
    if (node.clauses) return Object.assign({}, node, { _ctx: { now }, clauses: node.clauses.map(c => injectNow(c, now)) });
    return Object.assign({}, node, { _ctx: { now } });
  }

  window.AminoRowStore = { create, compileFilter, OPERATORS, ALIASES };
})();
