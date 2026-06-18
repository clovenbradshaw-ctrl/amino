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
assert.ok(globalThis.AminoDB && globalThis.AminoDB.buildTable, 'AminoDB (db engine) loaded');

// stub the live homeserver bridge — this test is about the fold/projection
globalThis.MatrixLive = {
  subscribe: () => () => {},
  isAuthed: () => false,
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

// 3b) the Database view (only computed on the db screen) shows every real set
c.state.view = 'db';
vm = c.renderVals();
ok(vm.dbRows.length === 2, 'render: Database view shows folded rows');
ok(vm.dbTabs.some((t) => t.name === 'client'), 'Database lists the real `client` set as a tab');
ok(vm.dbColumns.some((col) => col.name === 'Family Name'), 'Database columns are the folded fields');

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

console.log(`\namino-app.test: ${pass} assertions passed`);
