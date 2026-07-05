// Verifies airtable-push.js — the outbound drain (workspace → Airtable) that
// completes two-way sync. Covers the pure planner (fold state → create/update/
// delete ops, computed-field skipping, echo-safe field diffing) and the full
// drain against an in-memory fake Airtable: creates POST + backfill the record
// id, real edits GET-then-PATCH only the changed fields, echoes are dropped, and
// tombstones DELETE. Pure / headless — no homeserver, no network.
import fs from 'fs';
import assert from 'assert';

globalThis.window = globalThis;
new Function('window', fs.readFileSync('public/engine.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/airtable-push.js', 'utf8'))(globalThis);
const ME = globalThis.MatrixEngine;
const P = globalThis.AirtablePush;
assert.ok(ME && P && P.start && P.__test, 'engine + airtable-push loaded');

let pass = 0;
const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok ', m); };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m + ` (got ${JSON.stringify(a)})`); pass++; console.log('  ok ', m); };

ME.setNamespace('app.aminoimmigration');
let seq = 0;
const ev = (op, content) => ({ event_id: '$e' + seq, type: ME.eventType(op), content, sender: '@u:h', origin_server_ts: 1716600000000 + (++seq) });
const imp = ME.makeAnchor('import', { s: 'People' }, '@u', 1);
const p1 = ME.makeAnchor('People', { a: 1 }, '@airtable', 0);
const p2 = ME.makeAnchor('People', { a: 2 }, '@airtable', 0);
const p3 = ME.makeAnchor('People', { a: 3 }, '@airtable', 0);

// A workspace with one Airtable-imported set ("People", base appX) and three
// folded rows: an existing synced row (rec1), a new local row (no id), and a
// tombstoned synced row (rec3). "Total" is a computed column — never written.
const base = [
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['People'] }),
  ev(ME.OP.DEF, { anchor: null, path: '_schema.fields.People', value: [
    { name: 'Name', type: 'text' }, { name: 'Age', type: 'number' }, { name: 'Total', type: 'formula' },
  ] }),
  ev(ME.OP.INS, { anchor: imp, entity_type: 'import', payload: {} }),
  ev(ME.OP.DEF, { anchor: imp, path: 'derived_set', value: 'People' }),
  ev(ME.OP.DEF, { anchor: imp, path: 'source', value: 'airtable' }),
  ev(ME.OP.DEF, { anchor: imp, path: 'airtable_base', value: 'appX' }),
  ev(ME.OP.INS, { anchor: p1, entity_type: 'People', payload: { _recordId: 'rec1', _origin: 'airtable', Name: 'Alice', Age: 30, Total: 999 } }),
  ev(ME.OP.INS, { anchor: p2, entity_type: 'People', payload: { Name: 'Bob', Age: 20 } }),
  ev(ME.OP.INS, { anchor: p3, entity_type: 'People', payload: { _recordId: 'rec3', _origin: 'airtable', Name: 'Carol' } }),
  ev(ME.OP.SEG, { anchor: p3, partition: '_deleted' }),
];
const state = ME.fold(base);
ok(state.entities[p1] && state.entities[p1]._recordId === 'rec1', 'folded synced row carries its _recordId');
ok(state.partitions[p3] === '_deleted', 'tombstoned row is in the _deleted partition');

// ── pure planner ──
const { creates, updates, deletes } = P.__test.planCandidates(state, 'appX');
eq(creates.map(c => c.tableName), ['People'], 'a new local row plans a create');
eq(creates[0].fields, { Name: 'Bob', Age: 20 }, 'create carries its writable fields');
eq(updates.map(u => u.recordId), ['rec1'], 'a synced row with a record id plans an update');
ok(!('Total' in updates[0].fields), 'computed "Total" column is never written');
eq(updates[0].fields, { Name: 'Alice', Age: 30 }, 'update carries only writable, coerced fields');
eq(deletes.map(d => d.recordId), ['rec3'], 'a tombstoned synced row plans a delete');

// author-gating: only the member who created a row plans its create (no dup rows
// across members); updates/deletes stay author-agnostic (idempotent by recordId).
// p2 ("Bob") was authored by '@u:h' in the timeline above.
eq(P.__test.planCandidates(state, 'appX', '@u:h').creates.length, 1, 'the row\'s author plans its create');
eq(P.__test.planCandidates(state, 'appX', '@other:h').creates.length, 0, 'a non-author does not re-create the row');
eq(P.__test.planCandidates(state, 'appX', '@other:h').updates.length, 1, 'but updates are author-agnostic (idempotent, so any member can flush)');

// ── coercion + echo-diff ──
eq(P.__test.coerce('number', '31'), 31, 'number coercion parses numeric strings');
eq(P.__test.coerce('boolean', 'yes'), true, 'boolean coercion reads truthy words');
ok(P.__test.sameValue(30, '30'), 'sameValue treats 30 and "30" as equal (no spurious PATCH)');
eq(P.__test.changedFields({ Name: 'Alice', Age: 31 }, { Name: 'Alice', Age: 30 }), { Age: 31 },
   'changedFields returns only the fields that truly differ from Airtable');
eq(P.__test.changedFields({ Name: 'Alice', Age: 30 }, { Name: 'Alice', Age: 30 }), {},
   'changedFields drops an echo (local equals upstream)');

// ── full drain against a fake Airtable ──
function fakeAirtable(seedPeople) {
  const store = { People: seedPeople };
  const calls = [];
  let n = 0;
  async function f(url, init) {
    const method = init.method;
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    const m = url.match(/\/appX\/([^/?]+)(?:\/([^/?]+))?/);
    const table = decodeURIComponent(m[1]); const rid = m[2];
    const tbl = store[table] || (store[table] = {});
    let resp = {}, status = 200;
    if (method === 'GET') {
      if (rid) { if (!tbl[rid]) { status = 404; resp = { error: { message: 'not found' } }; } else resp = { id: rid, fields: tbl[rid] }; }
    } else if (method === 'POST') {
      resp = { records: (body.records || []).map(r => { const id = 'recNEW' + (++n); tbl[id] = { ...r.fields }; return { id, fields: tbl[id] }; }) };
    } else if (method === 'PATCH') {
      resp = { records: (body.records || []).map(r => { tbl[r.id] = { ...(tbl[r.id] || {}), ...r.fields }; return { id: r.id, fields: tbl[r.id] }; }) };
    } else if (method === 'DELETE') {
      const ids = [...url.matchAll(/records\[\]=([^&]+)/g)].map(x => decodeURIComponent(x[1]));
      ids.forEach(id => delete tbl[id]);
      resp = { records: ids.map(id => ({ id, deleted: true })) };
    }
    return { ok: status >= 200 && status < 300, status, json: async () => resp };
  }
  return { f, calls, store };
}

const emits = [];
let cur = state;
const air = fakeAirtable({ rec1: { Name: 'Alice', Age: 30 }, rec3: { Name: 'Carol' } });
await P.start({
  roomId: '!ws', baseId: 'appX', token: 'patX',
  getState: () => cur, emit: (op, content) => emits.push({ op, content }), log: () => {},
  fetchImpl: air.f,
});
await P.flushNow();

// create: POST issued once, and the new record id is DEF'd back onto the entity.
const posts = air.calls.filter(c => c.method === 'POST');
eq(posts.length, 1, 'drain POSTs the new row once');
eq(posts[0].body.records[0].fields, { Name: 'Bob', Age: 20 }, 'the POST carries the new row\'s fields');
ok(emits.some(e => e.content.anchor === p2 && e.content.path === '_recordId' && /^recNEW/.test(e.content.value)),
   'the returned record id is written back so future edits update, not re-create');

// echo: rec1 was GET'd but NOT PATCHed (local equals upstream).
ok(air.calls.some(c => c.method === 'GET' && /\/rec1$/.test(c.url)), 'an existing row is GET-checked before writing');
eq(air.calls.filter(c => c.method === 'PATCH').length, 0, 'no PATCH when the local value equals Airtable (echo suppressed)');

// delete: rec3 removed upstream.
ok(air.calls.some(c => c.method === 'DELETE' && /records\[\]=rec3/.test(c.url)), 'a tombstoned row is DELETEd upstream');
ok(!air.store.People.rec3, 'the deleted record is gone from Airtable');

// a real local edit now PATCHes only the changed field, and does not re-POST Bob.
const edited = base.slice();
edited.push(ev(ME.OP.DEF, { anchor: p1, path: 'Age', value: 31 }));
cur = ME.fold(edited);
const before = air.calls.length;
await P.flushNow();
const patches = air.calls.slice(before).filter(c => c.method === 'PATCH');
eq(patches.length, 1, 'a genuine local edit PATCHes');
eq(patches[0].body.records[0].fields, { Age: 31 }, 'the PATCH carries only the changed field');
eq(air.calls.slice(before).filter(c => c.method === 'POST').length, 0, 'the already-created row is not POSTed again');
P.stop();

// ── new rows across TWO tables POST to the right table each (grouped, not merged) ──
const impB = ME.makeAnchor('import', { s: 'Orgs' }, '@u', 5);
const np = ME.makeAnchor('People', { a: 7 }, '@u', 0);
const no = ME.makeAnchor('Orgs', { a: 8 }, '@u', 0);
const twoTables = ME.fold([
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['People', 'Orgs'] }),
  ev(ME.OP.INS, { anchor: imp, entity_type: 'import', payload: {} }),
  ev(ME.OP.DEF, { anchor: imp, path: 'derived_set', value: 'People' }),
  ev(ME.OP.DEF, { anchor: imp, path: 'source', value: 'airtable' }),
  ev(ME.OP.DEF, { anchor: imp, path: 'airtable_base', value: 'appX' }),
  ev(ME.OP.INS, { anchor: impB, entity_type: 'import', payload: {} }),
  ev(ME.OP.DEF, { anchor: impB, path: 'derived_set', value: 'Orgs' }),
  ev(ME.OP.DEF, { anchor: impB, path: 'source', value: 'airtable' }),
  ev(ME.OP.DEF, { anchor: impB, path: 'airtable_base', value: 'appX' }),
  ev(ME.OP.INS, { anchor: np, entity_type: 'People', payload: { Name: 'Dana' } }),
  ev(ME.OP.INS, { anchor: no, entity_type: 'Orgs', payload: { Name: 'Acme' } }),
]);
const air2 = fakeAirtable({});
let cur2 = twoTables;
await P.start({ roomId: '!ws', baseId: 'appX', token: 'patX', userId: '@u:h', getState: () => cur2, emit: () => {}, log: () => {}, fetchImpl: air2.f });
await P.flushNow();
const p2posts = air2.calls.filter(c => c.method === 'POST');
ok(p2posts.some(c => /\/appX\/People$/.test(c.url) && c.body.records[0].fields.Name === 'Dana'), 'a new People row POSTs to People');
ok(p2posts.some(c => /\/appX\/Orgs$/.test(c.url) && c.body.records[0].fields.Name === 'Acme'), 'a new Orgs row POSTs to Orgs (not merged into the first table)');
P.stop();

console.log(`\nairtable-push.test: ${pass} assertions passed`);
