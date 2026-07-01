// scripts/bench-rowstore.mjs — reproducible data-layer benchmark for the query spine.
// Run: node --max-old-space-size=4096 scripts/bench-rowstore.mjs [N]   (default 1,000,000)
// → columnar store (row-store.js) → query() (window / filter / group / sort /
// search). This is the data-layer measurement behind PERF-BASELINE.md; it does
// not render the DOM (that's the browser's job) but it is where the O(N) walls
// the plan targets actually lived.
import fs from 'fs';
globalThis.self = globalThis; globalThis.window = globalThis;
new Function('self', fs.readFileSync('public/rows-materialize.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/row-store.js', 'utf8'))(globalThis);
const AM = globalThis.AminoMaterialize, RS = globalThis.AminoRowStore;

const N = Number(process.argv[2] || 1_000_000);
const ms = t => `${t.toFixed(1)} ms`;
const now = () => Number(process.hrtime.bigint() / 1000n) / 1000; // ms, no Date
const mb = b => `${(b / 1048576).toFixed(0)} MB`;
const time = (label, fn) => { const t0 = now(); const r = fn(); const dt = now() - t0; console.log(`  ${label.padEnd(42)} ${ms(dt).padStart(11)}`); return { r, dt }; };

// ── 1. synthesize a realistic immigration CSV (deterministic, no RNG) ──
const FAM = ['Lopez','Nguyen','Adams','Zimmer','Khan','Garcia','Okafor','Silva','Cohen','Tran'];
const FIRST = ['Maria','Bao','John','Ana','Omar','Luis','Chidi','Paulo','Sara','Mai'];
const RELIEF = ['Asylum','Cancellation','Adjustment','TPS','Withholding'];
const STATUS = ['Open','Pending','Closed','Hearing Set'];
console.log(`\nAMINO 1M-record data-layer benchmark  (N = ${N.toLocaleString()})\n`);

const build = time('build synthetic CSV', () => {
  const parts = ['Family Name,First Name,A#,Relief Sought,Case Status,NTA Date\n'];
  for (let i = 0; i < N; i++) {
    const d = new Date(Date.UTC(2025, 0, 1) + (i % 900) * 86400000).toISOString().slice(0, 10);
    parts.push(`${FAM[i % 10]},${FIRST[(i * 7) % 10]},${100000000 + i},${RELIEF[i % 5]},${STATUS[i % 4]},${d}\n`);
  }
  return parts.join('');
});
const csv = build.r;
console.log(`  (CSV size ${mb(Buffer.byteLength(csv))})`);

const fieldPlan = [
  { name: 'Family Name', csvIdx: 0, type: 'text' },
  { name: 'First Name', csvIdx: 1, type: 'text' },
  { name: 'A#', csvIdx: 2, type: 'number' },
  { name: 'Relief Sought', csvIdx: 3, type: 'text' },
  { name: 'Case Status', csvIdx: 4, type: 'text' },
  { name: 'NTA Date', csvIdx: 5, type: 'date' },
];

// ── 2. streaming parse + materialize (what the worker does) ──
let rows = [];
const mat = time('streaming parse + materialize (worker)', () => {
  const out = [];
  AM.materialize(csv, { fieldPlan, setName: 'Client Info', shape: 'csv', hasHeader: true, importAnchor: 'imp1', created: 1 },
    batch => { for (const r of batch) out.push(r); });
  return out;
});
rows = mat.r;
console.log(`  → materialized ${rows.length.toLocaleString()} rows`);

// ── 3. load into the columnar store ──
const store = RS.create();
time('rowStore.loadSet (columnar)', () => store.loadSet('Client Info', rows));
rows = null; // drop the transient row objects; the store holds columns now
time('rowStore.count() (O(1))', () => store.count('Client Info'));

// ── 4. the queries a view issues — each returns only a window ──
console.log('\n  query() — each returns only the requested window + counts:');
const q = (label, opts) => { const t0 = now(); const res = store.query('Client Info', opts); const dt = now() - t0; const via = store.queryStats(); console.log(`  ${label.padEnd(42)} ${ms(dt).padStart(11)}   total=${String(res.total).padStart(9)}${via && via.viaIndex ? '  [indexed, scanned ' + via.scanned.toLocaleString() + ']' : ''}`); return dt; };

q('first paint: page 1 (offset 0, limit 100)', { offset: 0, limit: 100 });
q('filter is Asylum  (1st call: builds index)', { filter: { field: 'Relief Sought', op: 'is', value: 'Asylum' }, limit: 100 });
q('filter is Asylum  (2nd call: index cached)', { filter: { field: 'Relief Sought', op: 'is', value: 'Asylum' }, limit: 100 });
q('kanban group by Case Status (counts)', { group: { field: 'Case Status' }, limit: 0 });
q('kanban column: is "Hearing Set" (indexed)', { filter: { field: 'Case Status', op: 'is', value: 'Hearing Set' }, limit: 100 });
q('sort by A# desc, page 1', { sort: [{ field: 'A#', dir: 'desc' }], limit: 100 });
q('free-text search "okafor" (linear scan)', { search: 'okafor', limit: 100 });

const m = process.memoryUsage();
console.log(`\n  peak memory: rss ${mb(m.rss)}, heapUsed ${mb(m.heapUsed)}\n`);
