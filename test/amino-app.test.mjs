// Verifies the AMINO Component is wired to the real matrix-events fold:
//   no seed data, login-gated, and state = fold(timeline) projected into the
//   prototype's view-model (clients, notes, related individuals, DB rows).
// Pure/headless — exercises public/engine.js (the fold) + ui/amino-app.js (the
// rewired data layer) with a synthetic operator stream shaped exactly like the
// one window.MatrixLive.emit() produces.
import fs from 'fs';
import assert from 'assert';

globalThis.window = globalThis;
globalThis.prompt = () => null;
globalThis.alert = () => {};

// real fold engine (classic script → window.MatrixEngine)
new Function('window', fs.readFileSync('public/engine.js', 'utf8'))(globalThis);
const ME = globalThis.MatrixEngine;
assert.ok(ME && ME.fold && ME.OP, 'MatrixEngine (fold engine) loaded');

// import-row materializer + the Database data engine (window.AminoRows / AminoDB)
new Function('window', fs.readFileSync('public/import-rows.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/db-data.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/row-store.js', 'utf8'))(globalThis);
assert.ok(globalThis.AminoDB && globalThis.AminoDB.buildTable, 'AminoDB (db engine) loaded');
assert.ok(globalThis.AminoRowStore && globalThis.AminoRowStore.create, 'AminoRowStore (query spine) loaded');

// stub the live homeserver bridge — this test is about the fold/projection
globalThis.MatrixLive = {
  subscribe: () => () => {},
  isAuthed: () => false,
  isBooting: () => false,
  getSession: () => ({ mxid: '@admin:aminoimmigration.com' }),
  listRooms: () => [{ roomId: '!ws1', name: 'RK Lacy Law' }],
  getEventsForRoom: () => [],
  emit: async () => 'anchor', login: async () => ({}),
  createRoom: async () => '!ws1', inviteUser: async () => {}, logout: () => {},
};

class DCLogic {
  constructor(p) { this.props = p; }
  setState(u, cb) { this.state = Object.assign({}, this.state, typeof u === 'function' ? u(this.state) : u); if (cb) cb(); }
  forceUpdate() {}
}

const Component = new Function('DCLogic', 'window', 'prompt', 'alert',
  fs.readFileSync('ui/amino-app.js', 'utf8') + '\nreturn Component;')(DCLogic, globalThis, globalThis.prompt, globalThis.alert);

const c = new Component({});
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; console.log('  ok ', msg); };

// 1) no seed, login-gated, empty render does not crash
let vm = c.renderVals();
ok(vm.noClients === true, 'empty: no seed clients');
ok(vm.notConnected === true, 'empty: login screen shown until sign-in');
ok(vm.showLogin === true, 'empty: login form is the visible gate when signed out & not resuming');
ok(vm.booting === false, 'empty: no resume overlay when nothing is resuming');
ok(Array.isArray(vm.clients) && vm.clients.length === 0, 'empty: client list is empty');

// 2) fold a real operator stream into the projected client list
ME.setNamespace('app.aminoimmigration');
let n = 0;
const ev = (op, content) => ({ event_id: '$e' + n, type: ME.eventType(op), content, sender: '@admin:aminoimmigration.com', origin_server_ts: 1716600000000 + (++n) });
const A = ME.makeAnchor('client', {}, '@admin', 1);
const B = ME.makeAnchor('client', {}, '@admin', 2);
const N = ME.makeAnchor('note', {}, '@admin', 3);
const timeline = [
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['client', 'case', 'note'] }),
  ev(ME.OP.INS, { anchor: A, entity_type: 'client', payload: {} }),
  ev(ME.OP.DEF, { anchor: A, path: 'First Name', value: 'Maria Fernanda' }),
  ev(ME.OP.DEF, { anchor: A, path: 'Family Name', value: 'Lopez' }),
  ev(ME.OP.DEF, { anchor: A, path: 'A#', value: 'A 098-447-201' }),
  ev(ME.OP.DEF, { anchor: A, path: 'Country', value: 'Honduras' }),
  ev(ME.OP.DEF, { anchor: A, path: 'Case Status', value: 'In proceedings' }),
  ev(ME.OP.INS, { anchor: B, entity_type: 'client', payload: {} }),
  ev(ME.OP.DEF, { anchor: B, path: 'First Name', value: 'Patricio' }),
  ev(ME.OP.DEF, { anchor: B, path: 'Family Name', value: 'San Juan' }),
  ev(ME.OP.INS, { anchor: N, entity_type: 'note', payload: { client: A, text: 'I-589 filed 5/2', type: 'Filing', date: 'May 2, 2026' } }),
  ev(ME.OP.CON, { source_anchor: A, target_anchor: B, relation_type: 'sibling' }),
];
const clients = c.buildClients(ME.fold(timeline));
ok(clients.length === 2, 'fold → 2 client entities');
const lopez = clients.find((x) => x.f['Family Name'] === 'Lopez');
ok(lopez && lopez.f['First Name'] === 'Maria Fernanda', 'DEF field folds onto client');
ok(lopez && lopez.f['A#'] === 'A 098-447-201', 'A# DEF folds');
ok(lopez && lopez.notes.length === 1 && lopez.notes[0].act === 'I-589 filed 5/2', 'INS note links to its client');
ok(lopez && lopez.rel.length === 1, 'CON edge → related individual');

// 3) full view-model render with folded data + workspace/actions
c.clients = clients; c.curWs = '!ws1'; c.workspaces = [{ roomId: '!ws1', name: 'RK Lacy Law' }];
c.state.connected = true; c.state.cur = 0;
c._liveState = ME.fold(timeline); c._renderState = ME.fold(timeline); // demo-like: no imports
vm = c.renderVals();
ok(vm.clients.length === 2, 'render: client list shows folded clients');
ok(/Lopez|San Juan/.test(vm.cur.name), 'render: record panel header is a real client');
ok(vm.segCrmWeight === '700' && vm.segDbWeight === '600', 'view toggle highlights Clients in the CRM view');

// 3b) the Database view (only computed on the db screen) shows every real set
c.state.view = 'db';
vm = c.renderVals();
ok(vm.dbRows.length === 2, 'render: Database view shows folded rows');
ok(vm.dbTabs.some((t) => t.name === 'client'), 'Database lists the real `client` set as a tab');
ok(vm.dbColumns.some((col) => col.name === 'Family Name'), 'Database columns are the folded fields');
ok(vm.segDbWeight === '700' && vm.segCrmWeight === '600', 'view toggle flips to Database in the db view');

// 3c) opening a row populates the record drawer from the real entity
c.state.dbRecord = { set: 'client', anchor: A };
vm = c.renderVals();
ok(vm.dbRecordOpen === true && /Lopez/.test(vm.dbRecordTitle), 'record drawer opens the real entity');
ok(vm.dbRecordFields.some((f) => f.label === 'A#' && /098-447-201/.test(f.value)), 'record drawer shows folded fields');
c.state.dbRecord = null;
ok(vm.workspaceNav.some((w) => w.name === 'RK Lacy Law'), 'workspaceNav lists the signed-in user\'s workspace');
ok(vm.workspaceNav.some((w) => w.name === 'New workspace'), 'workspaceNav exposes New workspace');
ok(vm.quickActions.some((q) => q.label === 'New client'), 'quick action: New client');
ok(vm.quickActions.some((q) => q.label === 'Invite teammate'), 'quick action: Invite teammate');

// 4) resume race — the "login issue when already logged in" bug.
// The cold-boot session resume is async: it can finish AFTER this component has
// mounted and shown the login form. The UI must adopt that live session instead
// of leaving the form up (where a click fires a SECOND login → new device →
// crypto-store reset). Drive the bridge methods directly for determinism.
let loginCalls = 0;
const authedBridge = {
  subscribe: () => () => {},
  isAuthed: () => true,
  isBooting: () => false,
  getSession: () => ({ mxid: '@admin:aminoimmigration.com' }),
  listRooms: () => [{ roomId: '!ws1', name: 'RK Lacy Law' }],
  getEventsForRoom: () => [],
  login: async () => { loginCalls++; return {}; },
  emit: async () => 'a', createRoom: async () => '!ws1', inviteUser: async () => {}, logout: () => {},
};

// adopt: a live session lands us on the launchpad, no login form
const c2 = new Component({});
c2.ML = () => authedBridge;            // pin the bridge for this instance
c2.adoptLiveSession();
ok(c2.state.connected === true, 'adopt: a restored session marks us connected');
ok(c2.state.view === 'spaces', 'adopt: a restored session opens the spaces launchpad');
ok(c2.renderVals().showLogin === false, 'adopt: the login form is no longer shown');

// connect(): when already authed, never mint a second login
const c3 = new Component({});
c3.ML = () => authedBridge;
c3.state.loginUser = 'admin'; c3.state.loginPass = 'pw';
await c3.connect();
ok(loginCalls === 0, 'connect: already-authed never calls login() again (no new device)');
ok(c3.state.connected === true, 'connect: adopts the existing session instead');

// onLiveChange(): a resume that finishes AFTER mount flips the UI off the login form
let authed = false;
const lateBridge = Object.assign({}, authedBridge, { isAuthed: () => authed });
const c4 = new Component({});
c4.ML = () => lateBridge;
c4.onLiveChange();
ok(c4.state.connected === false, 'resume race: still signed out before the resume settles');
authed = true;                          // cold-boot resume completes
c4.onLiveChange();                      // bridge notifies its subscribers
ok(c4.state.connected === true, 'resume race: the subscriber adopts the session once it lands');
ok(c4.state.view === 'spaces', 'resume race: adopted session opens the launchpad');

// 5) workspace sync state — a fresh login's initial sync can land rooms AFTER
// the launchpad first renders. While that's in flight we show a "syncing" state
// (and keep Refresh) instead of prematurely claiming there are no spaces.
const c5 = new Component({});
c5.ML = () => authedBridge;
c5.demo = false; c5.workspaces = []; c5.state.connected = true; c5.state.view = 'spaces';
c5.state.wsSyncing = true;
let vm5 = c5.renderVals();
ok(vm5.spacesSyncing === true, 'syncing: launchpad shows a syncing state while rooms are still arriving');
ok(/[Ss]yncing/.test(vm5.spacesTagline), 'syncing: tagline reflects the in-flight sync, not "no workspaces"');
ok(typeof vm5.onRefreshSpaces === 'function', 'syncing: a manual Refresh is available');
c5.state.wsSyncing = false;             // sync window closed, still nothing found
vm5 = c5.renderVals();
ok(vm5.spacesSyncing === false && /Refresh/.test(vm5.spacesTagline), 'settled-empty: prompt to create or Refresh, not a bare "create your first"');

// 6) entering a workspace must OPEN (load + decrypt) the room before folding.
// Without openRoom(), getEventsForRoom() returns an empty buffer and the
// workspace folds to 0 records — the "0 records · 0 fields" bug.
let opened = null;
const openBridge = Object.assign({}, authedBridge, { openRoom: async (id) => { opened = id; } });
const c6 = new Component({});
c6.ML = () => openBridge;
c6.selectWorkspace('!ws1');
await Promise.resolve();
ok(opened === '!ws1', 'selectWorkspace opens (loads+decrypts) the room before folding');

// 7) cached / incremental fold — fold a room once, then only the appended
// events extend it. An unchanged buffer must not re-fold; an append must fold
// just the tail (ver bumps once per real change).
ME.setNamespace('app.aminoimmigration');
const c7 = new Component({});
let buf = [];
c7.ML = () => ({ ...authedBridge, getEventsForRoom: () => buf, NAMESPACE: 'app.aminoimmigration' });
c7.demo = false; c7.curWs = '!ws1';
const K = ME.makeAnchor('client', {}, '@a', 1);
buf = [ ev(ME.OP.INS, { anchor: K, entity_type: 'client', payload: {} }),
        ev(ME.OP.DEF, { anchor: K, path: 'Family Name', value: 'Vega' }) ];
const s7 = c7.foldRoom('!ws1');
ok(s7.entities[K] && s7.entities[K]['Family Name'] === 'Vega', 'foldRoom: initial fold builds the entity');
const ver1 = c7._foldCache['!ws1'].ver;
const s7b = c7.foldRoom('!ws1');
ok(s7b === s7 && c7._foldCache['!ws1'].ver === ver1, 'foldRoom: unchanged buffer returns the cached fold (no re-fold)');
buf = buf.concat([ ev(ME.OP.DEF, { anchor: K, path: 'Country', value: 'Mexico' }) ]);
const s7c = c7.foldRoom('!ws1');
ok(s7c.entities[K]['Country'] === 'Mexico' && c7._foldCache['!ws1'].ver === ver1 + 1, 'foldRoom: an appended event folds incrementally onto the cache');

// 8) Database grid windows its rows — a large set renders only a bounded page
// into the DOM (not all rows), and "Load more" grows the window.
const c8 = new Component({});
const bigEvents = [ ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['client'] }) ];
for (let i = 0; i < 250; i++) {
  const a = ME.makeAnchor('client', { i }, '@a', i);
  bigEvents.push(ev(ME.OP.INS, { anchor: a, entity_type: 'client', payload: {} }));
  bigEvents.push(ev(ME.OP.DEF, { anchor: a, path: 'Family Name', value: 'Name' + i }));
}
const big = ME.fold(bigEvents);
c8.curWs = '!ws1'; c8.workspaces = [{ roomId: '!ws1', name: 'W' }];
c8.state.connected = true; c8.state.view = 'db'; c8.state.dbTable = 'client';
c8._liveState = big; c8._renderState = big;
let v8 = c8.renderVals();
ok(v8.dbRows.length === c8.DB_PAGE, 'windowing: only a page of rows is rendered, not all 250');
ok(v8.dbTotal === 250 && v8.dbHasMore === true, 'windowing: total row count + hasMore are reported');
v8.onDbMore();
v8 = c8.renderVals();
ok(v8.dbRows.length === Math.min(250, c8.DB_PAGE + 300), 'windowing: Load more grows the window');

// 8a) Store-backed grid — an IMPORTED set is served by the columnar query spine
// (AminoRowStore.query), not Object.values(state.entities).filter. Proven by
// putting the rows ONLY in the store (render state has just the import carrier,
// NOT the rows) and confirming the grid still windows + searches all 300 — i.e.
// the 1M memory win: import rows need not live in state.entities.
const c8a = new Component({});
const impA = ME.makeAnchor('import', { s: 'Client Info' }, '@a', 1);
const impState = ME.fold([
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['Client Info'] }),
  ev(ME.OP.INS, { anchor: impA, entity_type: 'import', payload: {} }),
  ev(ME.OP.DEF, { anchor: impA, path: 'derived_set', value: 'Client Info' }),
  ev(ME.OP.DEF, { anchor: impA, path: 'field_plan', value: [{ name: 'Family Name', csvIdx: 0, type: 'text' }] }),
  ev(ME.OP.DEF, { anchor: impA, path: 'rows_imported', value: 300 }),
]);
const impRows = [];
for (let i = 0; i < 300; i++) impRows.push({ _anchor: impA + '#r' + i, _type: 'Client Info', 'Family Name': 'Fam' + i });
c8a.curWs = '!ws1'; c8a.workspaces = [{ roomId: '!ws1', name: 'W' }];
c8a.state.connected = true; c8a.state.view = 'db'; c8a.state.dbTable = 'Client Info';
c8a._liveState = impState;
c8a._renderState = impState;                 // rows are NOT in state.entities…
c8a._importRows = { [impA]: impRows };
c8a._syncRowStore(impState);                 // …only in the columnar store
ok(c8a._rowStore && c8a._rowStore.count('Client Info') === 300, 'store: _syncRowStore mirrors the imported set (300 rows)');
let v8a = c8a.renderVals();
ok(v8a.dbTotal === 300 && v8a.dbHasMore === true, 'store grid: total + hasMore come from query() with rows only in the store');
ok(v8a.dbRows.length === c8a.DB_PAGE, 'store grid: renders one windowed page, not all 300');
ok(v8a.dbColumns.some((col) => col.name === 'Family Name'), 'store grid: columns derived from the store');
c8a.state.dbSearch = 'fam299';
v8a = c8a.renderVals();
ok(v8a.dbTotal === 1 && v8a.dbRows.length === 1, 'store grid: search is a windowed query() over the store');
ok(v8a.dbRows[0].cells[0].text === 'Fam299', 'store grid: the matching row renders');

// 8b) Column layout — Airtable/Softr fidelity. The grid leads with the table's
// PRIMARY field, shown once (no synthetic-"Name" + real-"Name" duplicate), and a
// wide imported base is capped with an honest "+N more fields" expander.
const mkDb = (table, events) => {
  const cc = new Component({});
  const st = ME.fold(events);
  cc.curWs = '!ws1'; cc.workspaces = [{ roomId: '!ws1', name: 'W' }];
  cc.state.connected = true; cc.state.view = 'db'; cc.state.dbTable = table;
  cc._liveState = st; cc._renderState = st;
  return cc;
};
const L1 = ME.makeAnchor('lead', { i: 1 }, '@a', 1);
const cLead = mkDb('lead', [
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['lead'] }),
  ev(ME.OP.INS, { anchor: L1, entity_type: 'lead', payload: {} }),
  ev(ME.OP.DEF, { anchor: L1, path: 'Name', value: 'Acme Corp' }),
  ev(ME.OP.DEF, { anchor: L1, path: 'Email', value: 'a@x.com' }),
  ev(ME.OP.DEF, { anchor: L1, path: 'Stage', value: 'New' }),
]);
let vLead = cLead.renderVals();
ok(vLead.dbColumns.filter((col) => col.name === 'Name').length === 1, 'columns: a literal "Name" field is not duplicated by the synthetic primary');
ok(vLead.dbColumns[0].name === 'Name', 'columns: the primary field leads the grid');
ok(vLead.dbRows[0].cells[0].isPrimary && vLead.dbRows[0].cells[0].text === 'Acme Corp', 'columns: the primary cell shows the primary field value');

// Wide table (40 data fields + a "Title" primary) → capped at 30 + expander.
const W1 = ME.makeAnchor('wide', { i: 1 }, '@a', 1);
const wideEvents = [ ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['wide'] }),
  ev(ME.OP.INS, { anchor: W1, entity_type: 'wide', payload: {} }),
  ev(ME.OP.DEF, { anchor: W1, path: 'Title', value: 'Row one' }) ];
for (let i = 0; i < 40; i++) wideEvents.push(ev(ME.OP.DEF, { anchor: W1, path: 'f' + String(i).padStart(2, '0'), value: 'v' + i }));
const cWide = mkDb('wide', wideEvents);
let vWide = cWide.renderVals();
ok(vWide.dbColumns[0].name === 'Title', 'wide: the "Title" primary leads the grid');
ok(vWide.dbColumns.length === 31, 'wide: 40 data fields are capped to 30 (+ primary) by default');
ok(vWide.dbHasHiddenCols === true && vWide.dbHiddenCols === 10, 'wide: the hidden-field count is surfaced honestly');
vWide.onDbShowAllCols();
vWide = cWide.renderVals();
ok(vWide.dbColumns.length === 41 && vWide.dbHasHiddenCols === false, 'wide: "show all fields" expands to every column');
ok(vWide.dbCanCollapseCols === true, 'wide: a collapse control is offered once expanded');

// Empty columns sink below populated ones, regardless of schema order.
const E0 = ME.makeAnchor('rec', { i: 0 }, '@a', 0), E1 = ME.makeAnchor('rec', { i: 1 }, '@a', 1);
const cEmpty = mkDb('rec', [
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['rec'] }),
  ev(ME.OP.DEF, { anchor: null, path: '_schema.fields.rec', value: [{ name: 'Aaa Empty', type: 'text' }, { name: 'Zzz Filled', type: 'text' }] }),
  ev(ME.OP.INS, { anchor: E0, entity_type: 'rec', payload: {} }),
  ev(ME.OP.DEF, { anchor: E0, path: 'Zzz Filled', value: 'has 0' }),
  ev(ME.OP.INS, { anchor: E1, entity_type: 'rec', payload: {} }),
  ev(ME.OP.DEF, { anchor: E1, path: 'Zzz Filled', value: 'has 1' }),
]);
const vEmpty = cEmpty.renderVals();
ok(vEmpty.dbColumns[1] && vEmpty.dbColumns[1].name === 'Zzz Filled', 'ordering: a populated column leads an empty one regardless of schema order');
ok(vEmpty.dbColumns[vEmpty.dbColumns.length - 1].name === 'Aaa Empty', 'ordering: an always-empty column sinks to the end');

// 8e) The toolbar is real — Sort / Filter / Group / Hide all compile into
// AminoRowStore.query() params via the per-set view spec, on a native set routed
// through a transient store. Drives the same handlers the template binds.
const cTb = new Component({});
const tbEvents = [ ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['client'] }) ];
const seed = [
  { Name: 'Lopez',  Status: 'Open',   Age: 40 },
  { Name: 'Nguyen', Status: 'Open',   Age: 30 },
  { Name: 'Adams',  Status: 'Closed', Age: 50 },
  { Name: '',       Status: 'Open',   Age: 20 }, // blank primary → filtered out
  { Name: 'Zimmer', Status: 'Closed', Age: 35 },
];
seed.forEach((r, i) => {
  const a = ME.makeAnchor('client', { i }, '@a', i);
  tbEvents.push(ev(ME.OP.INS, { anchor: a, entity_type: 'client', payload: {} }));
  for (const k of Object.keys(r)) if (r[k] !== '') tbEvents.push(ev(ME.OP.DEF, { anchor: a, path: k, value: r[k] }));
});
cTb.curWs = '!ws1'; cTb.workspaces = [{ roomId: '!ws1', name: 'W' }];
cTb.state.connected = true; cTb.state.view = 'db'; cTb.state.dbTable = 'client';
const tbState = ME.fold(tbEvents);
cTb._liveState = tbState; cTb._renderState = tbState;
let vt = cTb.renderVals();
ok(vt.dbTotal === 5, 'toolbar: native set routes through a transient store (5 rows)');
ok(vt.dbTools.length === 4 && vt.dbTools[2].label === 'Sort', 'toolbar: Sort/Filter/Group/Hide buttons present');

// Sort: click the primary ("Name") header → asc, then desc.
const nameCol = vt.dbColumns[0];
nameCol.onSort();
vt = cTb.renderVals();
ok(vt.dbColumns[0].sortIcon === 'arrow-up', 'sort: header click sets an asc indicator');
ok(vt.dbRows[0].cells[0].text === 'Adams', 'sort: rows are ordered by the sorted field (asc)');
vt.dbColumns[0].onSort();
vt = cTb.renderVals();
ok(vt.dbColumns[0].sortIcon === 'arrow-down' && vt.dbRows[0].cells[0].text === 'Zimmer', 'sort: a second click flips to desc');

// Filter: the Filter button toggles a primary-not-empty clause via query().
vt.dbTools[1].onClick();
vt = cTb.renderVals();
ok(vt.dbTotal === 4, 'filter: primary-not-empty drops the blank-Name row (query filter)');
ok(vt.dbTools[1].active === true && vt.dbTools[1].label === 'Filter · 1', 'filter: the button reflects the active filter');
vt.dbTools[1].onClick();
vt = cTb.renderVals();
ok(vt.dbTotal === 5, 'filter: toggling again clears it');

// Group: the Group button cycles to the select column and returns counts.
vt.dbTools[3].onClick();
vt = cTb.renderVals();
ok(vt.dbGrouped === true && vt.dbGroupField === 'Status', 'group: cycles to the eligible select column');
const gmap = Object.fromEntries(vt.dbGroups.map(g => [g.key, g.count]));
ok(gmap.Open === '3' && gmap.Closed === '2', 'group: query() returns per-group counts');

// Hide: hide the Age column via its header affordance; the button reflects it.
const ageCol = vt.dbColumns.find(c => c.name === 'Age');
ageCol.onHide();
vt = cTb.renderVals();
ok(!vt.dbColumns.some(c => c.name === 'Age'), 'hide: a hidden field drops out of the columns');
ok(vt.dbTools[0].label === 'Fields · 1 hidden', 'hide: the button reflects the hidden count');

// 8f) Kanban (Phase 3) — a view type that is a windowed query() per group value.
// cTb already has group = Status; switch to the kanban view via the switcher.
const kanBtn = vt.dbViewTypes.find(v => v.key === 'kanban');
ok(kanBtn, 'kanban: the view switcher offers Kanban when a groupable column exists');
kanBtn.onPick();
vt = cTb.renderVals();
ok(vt.dbIsKanban === true && vt.dbKanban.field === 'Status', 'kanban: switches to a board grouped by the select column');
const kmap = Object.fromEntries(vt.dbKanban.columns.map(c => [c.key, c.cards.length]));
ok(kmap.Open === 3 && kmap.Closed === 2, 'kanban: each column is a windowed query() of its group');
ok(vt.dbKanban.columns[0].key === 'Open' && typeof vt.dbKanban.columns[0].cards[0].title === 'string', 'kanban: columns carry counts + cards with titles');
const gridBtn = vt.dbViewTypes.find(v => v.key === 'table');
gridBtn.onPick();
vt = cTb.renderVals();
ok(vt.dbIsTable === true && vt.dbIsKanban === false, 'kanban: switch back to the grid view');

// 8g) Gallery — the grid's windowed query() rows as cards (nearly free).
const galBtn = vt.dbViewTypes.find(v => v.key === 'gallery');
ok(galBtn, 'gallery: the switcher offers Gallery');
galBtn.onPick();
vt = cTb.renderVals();
ok(vt.dbIsGallery === true && vt.dbIsTable === false, 'gallery: switches to the card layout');
ok(vt.dbGallery.cards.length === 5 && typeof vt.dbGallery.cards[0].title === 'string', 'gallery: one card per windowed query() row');

// 8h) Calendar — rows laid out by day over a detected date field.
const cCal = new Component({});
const calEvents = [ ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['case'] }) ];
[['A', '2026-03-01'], ['B', '2026-03-01'], ['C', '2026-04-15']].forEach(([name, d], i) => {
  const a = ME.makeAnchor('case', { i }, '@a', i);
  calEvents.push(ev(ME.OP.INS, { anchor: a, entity_type: 'case', payload: {} }));
  calEvents.push(ev(ME.OP.DEF, { anchor: a, path: 'Name', value: name }));
  calEvents.push(ev(ME.OP.DEF, { anchor: a, path: 'Hearing', value: d }));
});
cCal.curWs = '!ws1'; cCal.workspaces = [{ roomId: '!ws1', name: 'W' }];
cCal.state.connected = true; cCal.state.view = 'db'; cCal.state.dbTable = 'case';
const calState = ME.fold(calEvents);
cCal._liveState = calState; cCal._renderState = calState;
let vc = cCal.renderVals();
const calBtn = vc.dbViewTypes.find(v => v.key === 'calendar');
ok(calBtn, 'calendar: the switcher offers Calendar when a date field is detected');
calBtn.onPick();
vc = cCal.renderVals();
ok(vc.dbIsCalendar === true && vc.dbCalendar.field === 'Hearing', 'calendar: lays out over the detected date field');
ok(vc.dbCalendar.days.length === 2, 'calendar: rows bucket into distinct days');
ok(vc.dbCalendar.days[0].date === '2026-03-01' && vc.dbCalendar.days[0].cards.length === 2, 'calendar: the first day holds its two records, sorted by date');

// 9) Sync & storage page — renders the bridge's sync/storage snapshot.
const c9 = new Component({});
c9.ML = () => ({
  getStorageStatus: async () => ({
    opfs: { room: { bytes: 2048, files: 3 }, checkpoint: { bytes: 0, files: 0 }, media: { bytes: 1048576, files: 2 }, other: { bytes: 0, files: 0 }, totalBytes: 1050624 },
    caches: { bytes: 4096, entries: 5 }, measuredBytes: 1054720, quota: 1000000000, usage: 1050624, persisted: false, idbNames: ['matrix-crypto'],
  }),
  getSyncStatus: () => ({ phase: 'syncing', roomsTotal: 3, roomsDone: 1, blocksTotal: 10, blocksDone: 4, recovered: 42, errors: [] }),
  getPendingCount: () => 2, getNetwork: () => ({ online: true }), getProgressLog: () => [{ ts: 1, msg: 'opened workspace' }],
});
await c9.refreshSync();
c9.state.view = 'sync';
const v9 = c9.syncModel();
ok(v9.syncPending === '2' && v9.syncHasPending === true, 'sync page: pending writes are surfaced');
ok(v9.syncRooms === '1 / 3' && v9.syncBlocks === '4 / 10', 'sync page: initial-sync progress is surfaced');
ok(v9.storageBuckets.length === 4 && /\d/.test(v9.storageMeasured), 'sync page: local OPFS/cache storage breakdown is surfaced');
ok(v9.storageNotPinned === true, 'sync page: offers to pin storage when not yet persistent');

console.log(`\namino-app.test: ${pass} assertions passed`);
