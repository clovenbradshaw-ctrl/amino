// Verifies the pure parse + materialize module (public/rows-materialize.js) that
// runs inside public/rows.worker.js off the main thread: the streaming CSV
// parser handles chunk boundaries and quoted commas, materialize() coerces types
// / skips the header / stashes link refs exactly like import-rows.js, emits in
// batches, and the output feeds straight into the columnar row store. Pure /
// headless — no worker, no DOM.
import fs from 'fs';
import assert from 'assert';

globalThis.self = globalThis; globalThis.window = globalThis;
new Function('self', fs.readFileSync('public/rows-materialize.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/row-store.js', 'utf8'))(globalThis);
const AM = globalThis.AminoMaterialize, RS = globalThis.AminoRowStore;
assert.ok(AM && AM.materialize && AM.createCSVParser, 'rows-materialize loaded');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok ', m); };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m + ` (got ${JSON.stringify(a)})`); pass++; console.log('  ok ', m); };

// ── streaming parser: fed in arbitrary chunks, splits records + keeps quoted commas ──
const csv = 'Family Name,First Name,A#,NTA Date\nLopez,Maria,300,2026-03-01\n"Nguyen, Jr",Bao,100,2026-01-15\n';
const records = [];
const parser = AM.createCSVParser(f => records.push(f.slice()));
// three deliberately awkward chunk boundaries (mid-field, mid-quote, mid-newline)
parser.push(csv.slice(0, 10));
parser.push(csv.slice(10, 45));
parser.push(csv.slice(45));
parser.end();
eq(records.length, 3, 'streaming parser yields all 3 records across chunk boundaries');
eq(records[2][0], 'Nguyen, Jr', 'a quoted comma stays one field even split across chunks');

// ── materialize CSV: header skipped, types coerced, batched ──
const csvPlan = [
  { name: 'Family Name', csvIdx: 0, type: 'text' },
  { name: 'First Name',  csvIdx: 1, type: 'text' },
  { name: 'A#',          csvIdx: 2, type: 'number' },
  { name: 'NTA Date',    csvIdx: 3, type: 'date' },
];
const batches = [];
const total = AM.materialize(csv, {
  fieldPlan: csvPlan, setName: 'Client Info', shape: 'csv', hasHeader: true,
  importAnchor: 'imp1', created: 111, sender: '@a:x', eventId: '$e1', batchSize: 1,
}, b => batches.push(b));
const csvRows = batches.flat();
eq(total, 2, 'materialize returns the row count (header excluded)');
eq(batches.length, 2, 'batchSize=1 emits one batch per row (progressive fill)');
ok(csvRows[0]._anchor === 'imp1#r0' && csvRows[1]._anchor === 'imp1#r1', 'row anchors are importAnchor#rN');
ok(csvRows[0]._type === 'Client Info' && csvRows[0]._materialized === 'imp1' && csvRows[0]._hwm === 2, 'hidden meta mirrors import-rows.js');
ok(typeof csvRows[0]['A#'] === 'number' && csvRows[0]['A#'] === 300, 'number column coerced');
eq(csvRows[0]['NTA Date'], '2026-03-01T00:00:00.000Z', 'date column coerced to ISO');
ok(csvRows[1]['Family Name'] === 'Nguyen, Jr', 'quoted comma survives materialization');

// ── materialize JSON: link fields stash _linkRefs, not columns ──
const json = JSON.stringify([
  { Matter: 'Lopez — Asylum', Client: ['cli1', 'cli2'] },
  { Matter: 'Solo Matter' },
]);
const jsonPlan = [
  { name: 'Matter', jsonKey: 'Matter', type: 'text' },
  { name: 'Client', jsonKey: 'Client', link: { to: 'Client Info', rel: 'client' } },
];
const jsonRows = [];
AM.materialize(json, { fieldPlan: jsonPlan, setName: 'Case Master View', shape: 'json', importAnchor: 'imp2', created: 222 },
  b => { for (const r of b) jsonRows.push(r); });
eq(jsonRows.length, 2, 'json rows materialize');
eq(jsonRows[0]._linkRefs.Client, { to: 'Client Info', rel: 'client', ids: ['cli1', 'cli2'] }, 'link field → _linkRefs (resolved to CON edges later)');
ok(!('Client' in jsonRows[0]), 'a link field is not stored as a data column');
ok(!jsonRows[1]._linkRefs, 'a row without the link has no _linkRefs');

// ── end-to-end: materialized rows feed straight into the columnar store ──
const store = RS.create();
store.loadSet('Client Info', csvRows);
eq(store.count('Client Info'), 2, 'store ingests the materialized batch');
eq(store.query('Client Info', { filter: { field: 'A#', op: 'gte', value: 200 } }).total, 1,
   'query() runs over worker-materialized rows (Lopez only)');
eq(store.query('Client Info', { search: 'nguyen' }).page[0]['First Name'], 'Bao',
   'search finds the worker-materialized row');

console.log(`\nrows-materialize.test: ${pass} assertions passed`);
