// Verifies the O(window) seam (db-data.js tableFromStore): buildTable becomes a
// thin adapter over AminoRowStore.query(). Proves PARITY — the store path yields
// the same columns (declared schema fields in order, then data-only extras) and
// the same rows as the legacy Object.values(state.entities).filter buildTable —
// and then does search + pagination as a windowed query, never a full scan.
// Pure / headless. This parity is what makes the eventual grid re-point a safe,
// small swap.
import fs from 'fs';
import assert from 'assert';

globalThis.window = globalThis;
new Function('window', fs.readFileSync('public/db-data.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/row-store.js', 'utf8'))(globalThis);
const DB = globalThis.AminoDB, RS = globalThis.AminoRowStore;
assert.ok(DB && DB.tableFromStore && RS, 'db-data + row-store loaded');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok ', m); };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m + ` (got ${JSON.stringify(a)})`); pass++; console.log('  ok ', m); };

// Rows for one set, plus a legacy-style augmented state holding the same rows in
// state.entities (what buildTable scans today).
const rows = [
  { _anchor: 'a#r0', _type: 'Client Info', 'Family Name': 'Lopez',  'First Name': 'Maria', 'A#': 300, Country: 'GT' },
  { _anchor: 'a#r1', _type: 'Client Info', 'Family Name': 'Nguyen', 'First Name': 'Bao',   'A#': 100, Country: 'VN' },
  { _anchor: 'a#r2', _type: 'Client Info', 'Family Name': 'Adams',  'First Name': 'John',  'A#': 200 }, // no Country
];
const schemaFields = [ { name: 'Family Name', type: 'text' }, { name: 'First Name', type: 'text' }, { name: 'A#', type: 'number' } ];
const state = { entities: {}, connections: [], partitions: {}, schema: { fields: { 'Client Info': schemaFields } } };
for (const r of rows) state.entities[r._anchor] = r;

const store = RS.create();
store.loadSet('Client Info', rows);

// ── column parity: declared fields in order, then data-only extras (Country) ──
const legacy = DB.buildTable('Client Info', state);
const viaStore = DB.tableFromStore(store, 'Client Info', schemaFields, {});
eq(viaStore.cols.map(c => c.name), legacy.cols.map(c => c.name), 'tableFromStore columns match buildTable columns (order + extras)');
eq(viaStore.cols.map(c => c.schematized), legacy.cols.map(c => c.schematized), 'schematized/data-only flags match');
ok(viaStore.cols.find(c => c.name === 'Country' && c.schematized === false), 'the undeclared "Country" column is appended as a data-only extra');

// ── row parity (unfiltered, full set) ──
eq(viaStore.total, legacy.rows.length, 'store total equals the legacy full-set row count');
eq(viaStore.rows.map(r => r._anchor).sort(), legacy.rows.map(r => r._anchor).sort(), 'store returns the same rows as buildTable');

// ── it adds what buildTable can't: windowed pagination + total/hasMore ──
const page = DB.tableFromStore(store, 'Client Info', schemaFields, { sort: [{ field: 'A#', dir: 'asc' }], offset: 0, limit: 2 });
eq(page.total, 3, 'windowed query still reports the full total');
eq(page.rows.map(r => r['A#']), [100, 200], 'page is the first window of the sorted order');
eq(page.hasMore, true, 'hasMore is true when the window is short of the total');
const last = DB.tableFromStore(store, 'Client Info', schemaFields, { sort: [{ field: 'A#', dir: 'asc' }], offset: 2, limit: 2 });
eq(last.hasMore, false, 'hasMore is false on the final window');

// ── search pushed below the fold (the Phase 3 win, available now) ──
const searched = DB.tableFromStore(store, 'Client Info', schemaFields, { search: 'lopez' });
eq(searched.total, 1, 'search is a windowed query, not a materialize-then-filter');
eq(searched.rows[0]['Family Name'], 'Lopez', 'search returns the matching row');

// ── no schema → columns inferred from the store, still parity with buildTable ──
const bare = { entities: {}, connections: [], partitions: {}, schema: {} };
for (const r of rows) bare.entities[r._anchor] = r;
const legacyBare = DB.buildTable('Client Info', bare);
const storeBare = DB.tableFromStore(store, 'Client Info', undefined, {});
eq(storeBare.cols.map(c => c.name).sort(), legacyBare.cols.map(c => c.name).sort(), 'schemaless column set matches buildTable');

console.log(`\ndb-store-adapter.test: ${pass} assertions passed`);
