// Verifies the query spine (public/row-store.js): the columnar per-set store and
// its single query() entry point — filter (per-type operators), multi-key sort,
// group counts, free-text search, hide-fields projection, and windowed
// pagination that returns only the page + total, never the whole set. Pure /
// headless — no homeserver, no DOM, mirrors test/db-data.test.mjs.
import fs from 'fs';
import assert from 'assert';

globalThis.window = globalThis;
new Function('window', fs.readFileSync('public/row-store.js', 'utf8'))(globalThis);
const RS = globalThis.AminoRowStore;
assert.ok(RS && RS.create && RS.compileFilter, 'row-store loaded');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok ', m); };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m + ` (got ${JSON.stringify(a)})`); pass++; console.log('  ok ', m); };

// A "Client Info"-shaped set, columnar-loaded like materialized import rows
// (note the hidden _anchor / _type meta fields must survive round-trips).
const rows = [
  { _anchor: 'a#r0', _type: 'Client Info', 'Family Name': 'Lopez',  'First Name': 'Maria', 'A#': 300, 'Relief Sought': 'Asylum',    Tags: ['urgent', 'detained'], 'NTA Date': '2026-03-01', Open: true },
  { _anchor: 'a#r1', _type: 'Client Info', 'Family Name': 'Nguyen', 'First Name': 'Bao',   'A#': 100, 'Relief Sought': 'Asylum',    Tags: ['urgent'],             'NTA Date': '2026-01-15', Open: true },
  { _anchor: 'a#r2', _type: 'Client Info', 'Family Name': 'Adams',  'First Name': 'John',  'A#': 200, 'Relief Sought': 'Cancellation', Tags: [],                  'NTA Date': '2025-11-20', Open: false },
  { _anchor: 'a#r3', _type: 'Client Info', 'Family Name': 'Zimmer', 'First Name': 'Ana',   'A#': 400, 'Relief Sought': 'Asylum',    Tags: ['detained'],           'NTA Date': '',           Open: true },
];

const store = RS.create();
store.loadSet('Client Info', rows);

// ── ingest / count ──
eq(store.count('Client Info'), 4, 'count() is maintained on load (O(1))');
ok(store.setNames().includes('Client Info'), 'setNames lists the loaded set');
eq(store.count('Nope'), 0, 'count() of an unknown set is 0');

// ── round-trip keeps hidden meta + all fields ──
const all = store.query('Client Info', {});
eq(all.total, 4, 'no filter → total is the whole set');
ok(all.page[0]._anchor === 'a#r0' && all.page[0]._type === 'Client Info', 'hidden _meta fields survive the columnar round-trip');

// ── filter: text ops ──
eq(store.query('Client Info', { filter: { field: 'First Name', op: 'contains', value: 'a' } }).total, 3,
   'text contains (Maria, Bao? no — Maria, Ana, ... case-insensitive "a")');
eq(store.query('Client Info', { filter: { field: 'Family Name', op: 'is', value: 'lopez' } }).total, 1,
   'text is (case-insensitive)');
eq(store.query('Client Info', { filter: { field: 'NTA Date', op: 'isEmpty' } }).total, 1, 'isEmpty catches the blank NTA Date');

// ── filter: number ops (canonical + Airtable labels) ──
eq(store.query('Client Info', { filter: { field: 'A#', op: 'gte', value: 200 } }).total, 3, 'number ≥');
eq(store.query('Client Info', { filter: { field: 'A#', op: '≥', value: 200 } }).total, 3, 'number ≥ via Airtable label alias');
eq(store.query('Client Info', { filter: { field: 'A#', op: 'between', value: [150, 350] } }).total, 2, 'number between');

// ── filter: select is any of ──
eq(store.query('Client Info', { filter: { field: 'Relief Sought', op: 'isAnyOf', value: ['Asylum'] } }).total, 3, 'select is any of');

// ── filter: multiselect ──
eq(store.query('Client Info', { filter: { field: 'Tags', op: 'hasAnyOf', value: ['detained'] } }).total, 2, 'multiselect has any of');
eq(store.query('Client Info', { filter: { field: 'Tags', op: 'hasAllOf', value: ['urgent', 'detained'] } }).total, 1, 'multiselect has all of');
eq(store.query('Client Info', { filter: { field: 'Tags', op: 'hasNoneOf', value: ['urgent'] } }).total, 2, 'multiselect has none of');

// ── filter: boolean ──
eq(store.query('Client Info', { filter: { field: 'Open', op: 'isChecked' } }).total, 3, 'boolean is checked');

// ── filter: date before/after + relative within ──
eq(store.query('Client Info', { filter: { field: 'NTA Date', op: 'before', value: '2026-01-01' } }).total, 1, 'date before');
eq(store.query('Client Info', { filter: { field: 'NTA Date', op: 'after', value: '2026-02-01' } }).total, 1, 'date after');
// within last 30 days of a fixed "now" = 2026-03-05: only 2026-03-01 (4 days)
// qualifies; 2026-01-15 is 49 days out, 2025-11-20 older, '' unparseable.
const now = Date.parse('2026-03-05T00:00:00Z');
eq(store.query('Client Info', { now, filter: { field: 'NTA Date', op: 'within', value: { n: 30, unit: 'day', dir: 'last' } } }).total, 1,
   'date within last N days (relative to a fixed now)');

// ── boolean predicate tree: and / or / not ──
eq(store.query('Client Info', { filter: { op: 'and', clauses: [
      { field: 'Relief Sought', op: 'is', value: 'Asylum' },
      { field: 'Open', op: 'isChecked' } ] } }).total, 3, 'AND of two clauses');
eq(store.query('Client Info', { filter: { op: 'or', clauses: [
      { field: 'Family Name', op: 'is', value: 'Adams' },
      { field: 'Family Name', op: 'is', value: 'Zimmer' } ] } }).total, 2, 'OR of two clauses');
eq(store.query('Client Info', { filter: { op: 'not', clauses: [
      { field: 'Relief Sought', op: 'is', value: 'Asylum' } ] } }).total, 1, 'NOT negates the clause');

// ── multi-key sort ──
const sorted = store.query('Client Info', { sort: [{ field: 'Relief Sought', dir: 'asc' }, { field: 'A#', dir: 'desc' }] });
eq(sorted.page.map(r => r['Family Name']), ['Zimmer', 'Lopez', 'Nguyen', 'Adams'],
   'multi-key sort: Relief asc, then A# desc within group');

// ── group counts over the filtered set ──
const grouped = store.query('Client Info', { group: { field: 'Relief Sought' } });
eq(grouped.groups, [{ key: 'Asylum', count: 3 }, { key: 'Cancellation', count: 1 }], 'group → {key, count}[] desc by count');
const groupedOpen = store.query('Client Info', { filter: { field: 'Open', op: 'isChecked' }, group: { field: 'Relief Sought' } });
eq(groupedOpen.groups, [{ key: 'Asylum', count: 3 }], 'group counts respect the active filter');

// ── free-text search (any field, case-insensitive) ──
eq(store.query('Client Info', { search: 'lopez' }).total, 1, 'search matches across fields');
eq(store.query('Client Info', { search: 'asylum' }).total, 3, 'search matches a select column value');

// ── hide-fields projection: page rows keep only requested cols + _meta ──
const projected = store.query('Client Info', { fields: ['Family Name'], limit: 1 });
const r0 = projected.page[0];
ok(r0['Family Name'] === 'Lopez' && r0._anchor === 'a#r0' && r0['A#'] === undefined && r0['First Name'] === undefined,
   'fields projects visible columns only (meta kept, others dropped)');

// ── windowed pagination returns only the page + total, never the whole set ──
const p = store.query('Client Info', { sort: [{ field: 'A#', dir: 'asc' }], offset: 1, limit: 2 });
eq(p.total, 4, 'pagination reports the full total');
eq(p.page.length, 2, 'pagination returns exactly one window');
eq(p.page.map(r => r['A#']), [200, 300], 'window is the correct slice of the sorted order');

console.log(`\nrow-store.test: ${pass} assertions passed`);
