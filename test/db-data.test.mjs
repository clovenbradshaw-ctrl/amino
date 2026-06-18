// Verifies the vendored Database data engine (public/db-data.js) reproduces
// bare-metal's derivation end-to-end: materialized import rows fold in typed by
// their derived_set, each row's _linkRefs resolve into CON edges, listSets
// enumerates every set with its imported row total, and buildTable yields the
// real columns + rows. Pure/headless — no homeserver, no DOM.
import fs from 'fs';
import assert from 'assert';

globalThis.window = globalThis;
new Function('window', fs.readFileSync('public/engine.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/import-rows.js', 'utf8'))(globalThis);
new Function('window', fs.readFileSync('public/db-data.js', 'utf8'))(globalThis);
const ME = globalThis.MatrixEngine, DB = globalThis.AminoDB;
assert.ok(ME && DB && DB.augmentState && DB.buildTable && DB.listSets, 'engines loaded');
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass++; console.log('  ok ', m); };

// A workspace whose data was imported via bare-metal: two derived sets, each
// stored as an `import` entity (rows live in a blob, not as events).
ME.setNamespace('io.matrix-events');
let n = 0;
const ev = (op, content) => ({ event_id: '$e' + (++n), type: ME.eventType(op), content, sender: '@admin:x', origin_server_ts: 1716600000000 + n });
const imp1 = ME.makeAnchor('import', { s: 'Client Info' }, '@admin', 1);
const imp2 = ME.makeAnchor('import', { s: 'Case Master View' }, '@admin', 2);
const timeline = [
  ev(ME.OP.DEF, { anchor: null, path: '_schema.tables', value: ['Client Info', 'Case Master View'] }),
  ev(ME.OP.INS, { anchor: imp1, entity_type: 'import', payload: {} }),
  ev(ME.OP.DEF, { anchor: imp1, path: 'derived_set', value: 'Client Info' }),
  ev(ME.OP.DEF, { anchor: imp1, path: 'field_plan', value: [{ name: 'First Name', csvIdx: 0, type: 'text' }, { name: 'Family Name', csvIdx: 1, type: 'text' }] }),
  ev(ME.OP.DEF, { anchor: imp1, path: 'rows_imported', value: 2 }),
  ev(ME.OP.INS, { anchor: imp2, entity_type: 'import', payload: {} }),
  ev(ME.OP.DEF, { anchor: imp2, path: 'derived_set', value: 'Case Master View' }),
  ev(ME.OP.DEF, { anchor: imp2, path: 'field_plan', value: [{ name: 'Matter', csvIdx: 0, type: 'text' }, { name: 'Client', link: { to: 'Client Info', rel: 'client' }, jsonKey: 'Client' }] }),
  ev(ME.OP.DEF, { anchor: imp2, path: 'rows_imported', value: 1 }),
];
const state = ME.fold(timeline);
ok(state.entities[imp1] && state.entities[imp1]._type === 'import', 'import carrier entity folds from the log');

// Rows as AminoRows.materializeImportRows would reconstruct them from the blob.
const importRows = {
  [imp1]: [
    { _anchor: imp1 + '#r0', _type: 'Client Info', _recordId: 'cli1', 'First Name': 'Maria', 'Family Name': 'Lopez' },
    { _anchor: imp1 + '#r1', _type: 'Client Info', _recordId: 'cli2', 'First Name': 'Bao', 'Family Name': 'Nguyen' },
  ],
  [imp2]: [
    { _anchor: imp2 + '#r0', _type: 'Case Master View', _recordId: 'case1', Matter: 'Lopez — Asylum',
      _linkRefs: { Client: { to: 'Client Info', rel: 'client', ids: ['cli1'] } } },
  ],
};

const rs = DB.augmentState(state, importRows, DB.activeImportAnchors(state));
ok(Object.values(rs.entities).filter(e => e._type === 'Client Info').length === 2, 'rows fold in typed by derived_set (Client Info ×2)');
ok(Object.values(rs.entities).some(e => e._type === 'Case Master View'), 'every imported set materializes, not just clients');
ok(rs.connections.some(c => c.type === 'client' && c.source === imp2 + '#r0' && c.target === imp1 + '#r0'),
   '_linkRefs resolve into a CON edge (case → client) — link columns populate');

const sets = DB.listSets(state, rs);
ok(sets.map(s => s.name).includes('Client Info') && sets.map(s => s.name).includes('Case Master View'), 'listSets enumerates every imported set');
ok(sets.find(s => s.name === 'Client Info').expected === 2, 'listSets reports the imported row total (folds before the blob streams in)');
ok(!sets.some(s => s.name === 'import'), 'the internal `import` carrier is not surfaced as a table');

const tbl = DB.buildTable('Client Info', rs);
ok(tbl.rows.length === 2 && tbl.cols.some(c => c.name === 'First Name') && !tbl.cols.some(c => c.name.startsWith('_')),
   'buildTable yields real columns + rows (hidden _ fields excluded)');
ok(DB.linksFromAnchor(imp2 + '#r0', 'Client Info', rs).some(l => /Lopez/.test(l.label)), 'linksFromAnchor resolves the related client by label');

console.log(`\ndb-data.test: ${pass} assertions passed`);
