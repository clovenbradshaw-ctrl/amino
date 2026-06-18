# Rebuilding AMINO on bare-metal-eo — notes & decisions

This records *why* AMINO is being re-pointed at the
[bare-metal-eo-matrix-app](https://github.com/clovenbradshaw-ctrl/bare-metal-eo-matrix-app)
engine, the concrete problems that motivated it, and the architecture we're
moving to. It is the running log for the "tear down amino and rebuild the skin
on top of bare metal" work.

## The problems we kept hitting (branch `claude/optimistic-fermi-3xuwkd`)

AMINO vendored bare-metal's **foundation** (`src/` — auth, crypto, rooms, fold)
but **not its application layer** (`public/*.jsx`: the real login, the
`io.matrix-events` namespace, Airtable/CSV import + row materialization, the
db/table/graph/sync views). It then hand-rolled a thin replacement under the
design-prototype skin. Every bug on that branch is the seam between the
hand-rolled shell and the real backend:

| Symptom (PR #30 / #31) | Root cause |
|---|---|
| **0 records** even though the room was full | AMINO folded live rooms under `app.aminoimmigration`; the foundation bridge writes events under `io.matrix-events`. Wrong namespace → the fold parsed nothing. |
| **"won't let me log in if I previously logged in"** | The crypto-store owner was keyed on user only. A fresh password login mints a new `device_id`; the stale Rust crypto store from the prior device made `initRustCrypto` throw, and the recovery delete ran *after* the SDK opened the store. (Fixed in `src/client.js` by keying the owner on user **+** device.) |
| Had to **re-port** bare-metal's importer | Imported Airtable sets store their rows in encrypted blobs, materialized on read — not as per-row events. AMINO re-derived that as `public/import-rows.js`. |
| **Cases / notes from other sets not joined** | The relational keys live in `_linkRefs` on each imported row; bare-metal turns them into `CON` edges. AMINO's projection didn't, so only `Client Info` ever showed. |

The throughline: **re-deriving what bare-metal already does correctly.** Each
re-derivation drifts, and the drift is the bug.

## Decision

Two questions were settled before any teardown:

1. **Approach — "keep the skin, vendor bare-metal as the engine."** Keep the
   AMINO immigration skin (the Customizable Record Panel + branding) as the face;
   stop re-implementing the backend. Where AMINO needs backend behaviour, it
   reuses bare-metal's *actual* code rather than a parallel copy.
2. **Scope — "get the Database view working first."**

## What changed first: the Database view

The cream Database grid in `ui/amino-template.html` is already generic — it
renders whatever `dbColumns` / `dbRows` / `dbTabs` the component hands it. Only
the **data layer** was wrong (a hardcoded `dbTables()` that knew about exactly
three immigration tables and projected only `Client Info`).

- **New `public/db-data.js` (`window.AminoDB`)** — `buildTable`, `inferType`,
  `linkedTypesFor` / `linksFromAnchor`, `augmentState` (materialized rows +
  `_linkRefs`→connections + the Airtable shadow pass), and `listSets`. These are
  **lifted verbatim** from bare-metal's `table-view.jsx` + `app.jsx`. Keep them
  in sync with bare-metal; do not fork them.
- **`ui/amino-app.js`** now builds one augmented render state per fold
  (`_renderState`), materializes **every** imported set (not just clients), and
  derives the Database tabs/columns/rows/record-drawer from `window.AminoDB`. The
  grid shows every real set with real columns, rows, and relational links.
- `projectLive` now treats only client-set rows as clients, so materializing all
  sets no longer turns cases/notes into "clients."

Verified headlessly by `test/db-data.test.mjs` (the derivation) and
`test/amino-app.test.mjs` (fold → render → Database view-model).

## Still to do (follow-ups)

- Per-set saved views + filter/sort/hide (bare-metal's `FilterPanel` /
  `SortPanel` are the next things to vendor).
- Join cases/notes into the CRM record panel via the same `CON`/`schema.links`
  the grid now resolves.
- Inline cell editing in the grid emitting real `DEF`/`INS` operators.
- Re-baseline `src/` against bare-metal on a cadence (currently identical except
  the re-login fix in `client.js`, which should also go upstream).
