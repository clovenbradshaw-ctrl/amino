# AMINO — Project board: 1M-scale store + configurable views

*The living tracker for the build. Rationale and deep-dives live in
[`BUILD-PLAN.md`](./BUILD-PLAN.md) (sequencing) and [`SCALING.md`](./SCALING.md)
(perf internals); acceptance numbers land in
[`PERF-BASELINE.md`](./PERF-BASELINE.md). This file is the board — check boxes
as work ships.*

**Scope:** single-tenant (RK Lacy Law), staff-only. Matrix room membership is
the entire permission model. No page builder, no theming, no multi-tenant, no
client-facing surfaces.

> Keep this board in the repo. Do **not** put client records, A-numbers, names,
> or any case data in external tools (Miro, etc.) — only architecture and plan.

---

## The one idea

**Views and the 1M-record goal are the same problem.** Filter / sort / group /
kanban-by-field / calendar-by-date are all *queries*. Build one query layer and
every view is a preset of it, while "no slowdown at 1M" is just a property of the
store the query runs against (indexed, columnar, off the main thread).

## The spine — one worker-hosted `query()` API

```
rowStore.query(set, {
  filter,   // predicate tree: {op:'and', clauses:[{field,op,value}, ...]}
  sort,     // [{field, dir}]  (multi-key)
  group,    // {field}         (kanban / grouped grid)
  search,   // free text (indexed)
  fields,   // visible columns
  offset, limit
}) -> { page: Row[], total: number, groups?: {key, count}[] }
```

```
Streaming parser ─▶ Web Worker ─▶ Columnar per-set store ─▶ query() ─▶ Renderers
(replaces parseCSV) (rows.worker.js)  (AminoRowStore)                  (grid · kanban
                                       typed cols, O(1) count           · calendar · gallery)
                                       never in state.entities)
```

Returns **only the requested window** plus counts — never a 1M array. The grid,
kanban, calendar and gallery are thin renderers over this one call.

**Views are schema.** A saved view is emitted as a `DEF` with `anchor=null,
path=_schema.views.<name>` — the exact mechanism the schema already uses — and
folds into `state.schema.views`. A teammate who opens the room folds the same
views: firm-wide view sharing, zero new infrastructure.

---

## Board

Status key: `[ ]` todo · `[~]` in progress · `[x]` done · **GATE** = blocks
everything after it.

### Phase 1 — The spine · *1–1.5 wk* · **GATE** 🔴
*Worker + streaming parse + columnar store + `query()`. Nothing else starts
until this exists — it is also the entire perf story.*

- [x] Columnar `AminoRowStore` — per-set typed columns; `count()` O(1); standalone (never enters `state.entities`) → `public/row-store.js`
- [x] `rowStore.query()` — filter · sort · group · search · fields · offset · limit → `{page, total, groups}`; per-type operators + boolean predicate tree; covered by `test/row-store.test.mjs` (31 assertions)
- [x] `public/rows.worker.js` — materialize import blobs off the main thread (batched postMessage protocol) + `public/rows-worker-client.js` main-thread client with an inline fallback
- [x] Streaming parser replaces `parseCSV` — chunked push/end CSV parser in `public/rows-materialize.js`, emits rows in batches (progressive fill); row mapping mirrors `import-rows.js`
- [x] Re-point `buildTable` / the grid at the store (read windows, not full sets)
  - [x] `AminoDB.tableFromStore()` — `buildTable` as a thin adapter over `store.query()`; **parity-tested** against the legacy full-scan `buildTable` (same columns + rows) plus windowed pagination/search (`test/db-store-adapter.test.mjs`, 12 assertions)
  - [x] `dbModel()` in `ui/amino-app.js` serves import-backed sets from the store (`_rowStore` + `_syncRowStore`); native fold-entity sets (client/note) keep `buildTable`. Verified headless in `amino-app.test.mjs` **with rows absent from `state.entities`** — proving the grid reads the store, incl. windowed search.

> **Phase 1 spine — done.** The columnar store + `query()` (`public/row-store.js`),
> the off-main-thread materializer (`rows-materialize.js` + `rows.worker.js` +
> `rows-worker-client.js`), the `tableFromStore` adapter, and the live grid swap
> all shipped and headless-tested (**65 new assertions**; the Database grid now
> serves imported sets from `query()`). Full `npm test` green (260 assertions,
> 6 files).
>
> **Deliberately deferred (Phase 4/5 follow-ups, not gate blockers):**
> `augmentState` still mirrors import rows into `state.entities` so the record
> drawer / CRM / link resolution keep working — dropping that (and moving
> single-record + link lookups onto the store/adjacency index) is the remaining
> memory win. And `materializeLive` still parses on the main thread via
> `AminoRows`; switching it to `AminoRowsWorker` (worker built + ready, with a
> main-thread fallback) is the off-thread cutover. Both want in-app verification.

### Phase 2 — Make the painted toolbar real · *1 wk* · the "up & running" ask 🟠
*The Hide fields / Filter / Sort / Group buttons are now live, driven by a
per-set **view spec** (`this.state.dbSpecs[set]`) that compiles into
`query()` params. Every grid — imported or native — flows through the query
spine (native sets via a transient store), so all four work uniformly.*

- [~] **Filter** — the button toggles a real predicate (primary `isNotEmpty`) through `query()`; the full per-type **builder UI** (operator table below) is the fast-follow. Engine + predicate tree already support every operator.
- [x] **Sort** — click a column header to cycle asc/desc/off (with a caret indicator), compiled to `query().sort`. Multi-key is engine-supported; drag-to-reorder UI is the fast-follow. Fixed: empties sink last in both directions.
- [x] **Group** — the Group button cycles the eligible select/boolean columns and renders a group-counts bar from `query().groups` (kanban's substrate).
- [x] **Hide fields** — per-column hide from the header (`spec.hidden`) drops columns before layout; the button shows the hidden count and resets.
- [x] Dead toolbar buttons in `ui/amino-app.js` are wired to handlers (`_cycleSort` / `_toggleFilter` / `_cycleGroup` / `_hideField` / `_patchSpec`); template binds header + toolbar `onClick`s. Covered by `amino-app.test.mjs` (+12 assertions).

### Phase 3 — View types (thin renderers over `query()`) · *1–1.5 wk* 🔵

- [x] Kanban — a view type that runs one **windowed `query()` per group value**; a view-type switcher (Grid/Kanban) sets `spec.type`, columns show group counts + card windows. Covered by `amino-app.test.mjs` (+5 assertions).
- [x] Calendar — a date-field is auto-detected (`_looksDate`); rows lay out by day over `query()` sorted by that field (`amino-app.test.mjs` +4 assertions)
- [~] Retire hardcoded hearings/deadlines lists — the calendar view is the real replacement over `NTA Date` / `Hearing` / due-date; removing the old hardcoded lists from the CRM screens is a follow-up cleanup
- [x] Gallery — the grid's windowed `query()` rows as a responsive card layout (reuses the same window; `amino-app.test.mjs` +3 assertions)

> **Kanban shipped.** The switcher lives in the grid toolbar; picking Kanban
> groups by the first select/boolean column (or the active group). Each column is
> a bounded `query()` (windowed like the grid). Calendar + gallery are the same
> pattern (a date-range filter / a card layout) and are the remaining Phase 3
> renderers.

### Phase 4 — Saved views as `_schema.views.*` · *0.5–1 wk* 🟣

- [x] Emit a view as a `DEF` (`anchor=null, path=_schema.views.<slug>`, value = `{name, set, type, sort, group, filter, hidden, dateField}`) — `_saveView`
- [x] View switcher per table — the views rail lists saved views for the active set (from `state.schema.views`), "Save current view" persists the spec, picking one applies it, "All records" clears; `amino-app.test.mjs` +6 assertions
- [ ] Star / default view per set — small follow-up (`_schema.viewDefault.<set>`)
- [x] Folds + syncs across staff devices (zero new infrastructure) — a view is just another schema-log `DEF`, so a teammate who opens the room folds the same views; verified it folds into `state.schema.views` and drives the rail

### Phase 5 — 1M hardening · *1 wk* ⚫

- [x] Per-field index for instant filter at 1M — a **lazy value index** with **equality pushdown** (`is` / `isAnyOf`, incl. inside `AND`) makes those queries O(matches), not O(N); built on first use, cached per set. Kanban's per-group `is` query now rides it. Verified by `queryStats().viaIndex` + reduced `scanned` (`row-store.test.mjs`).
- [x] Fast free-text **search** at 1M — each row's text folds into one cached lowercased **search blob** (single pass over the materialized columns, no second traversal, no ~1 GB inverted index), so a search is one `includes()` per row: **334 ms → 38 ms at 1M**, under the 150 ms bar (`row-store.test.mjs` +11, `queryStats().searchViaBlob`; a `searchFields` subset falls back to the per-field scan so the blob never over-matches). *Follow-up:* a precomputed **sort permutation** per column (sort is already 111 ms, under bar), and — for volumes past the firm's — a per-term postings index built **in the worker** (its ~9 s build / ~1 GB is wrong for a main-thread keystroke).
- [ ] Persist the columnar materialization to its own OPFS file, keyed by `import_seq` (skip re-parse on cold open) — **needs in-app verification** (touches the encrypted store + worker lifecycle)
- [ ] Link / adjacency index for related records (resolve in O(degree))
- [~] Meet `PERF-BASELINE.md` targets on a 1M set — the **data-layer harness landed** (`scripts/bench-rowstore.mjs`) and the store/query numbers are in `PERF-BASELINE.md`: at 1M, first paint **0.5 ms**, cached-index filter **<1 ms**, group **67 ms**, sort **111 ms**, free-text **search 38 ms** (cached blob) — **all data-layer targets now under bar**. Browser-side (main-thread block, dropped frames, cold-open) still needs a real tab.

> **Query-spine perf, verified at 1M (headless).** Two optimizations after the
> first benchmark: an exact index hit skips the redundant per-row re-test, and a
> predicate-free query skips building a 1M index array (direct window slice).
> First paint went 61 ms → **0.5 ms** and cached filter 135 ms → **<1 ms** at 1M.
> First-paint / cached-filter stay ~flat from 10k→1M — the window, not the set.

### Downloading 1M records from Matrix

1M rows are **one encrypted media blob**, not 1M events — the room timeline is a
handful of events (`import` INS + `field_plan`/`derived_set`/`file` DEFs), and
`getMediaBytes` resolves the blob (OPFS mirror first, else the authenticated
media endpoint), decrypts, and streams it into the worker parser. Download-once
(OPFS), request-coalesced, off-thread parse.

- [x] **gzip import blobs** (`src/crypto/gzip.js`) — compress before encrypt,
  decompress on read, marked `enc:'gzip'` in the media ref (old blobs read
  verbatim). Immigration CSV compresses to **~13% (≈8×)**: the 47 MB / 1M-row
  blob → ~6 MB, so downloads are ~8× cheaper **and** ~8× more rows fit under the
  homeserver `max_upload_size` (~50 MB) cap. Codec round-trip tested
  (`test/gzip.test.mjs`). *Needs in-app verification (touches the encrypted media
  path).*
- [ ] **Chunk large imports** into multiple sub-blobs each < `max_upload_size`
  (downloads already coalesce/parallelize) — removes the single-blob ceiling for
  10M+.
- [ ] **Stream download → decrypt → parse** (AES-CTR is a stream cipher;
  `DecompressionStream` streams; incremental parse) — bounded memory + progressive
  fill for very large blobs.

---

## Filter / sort operators (so it feels like Airtable)

| Field type | Operators |
|---|---|
| text / longtext / url / email | is, is not, contains, does not contain, is empty, is not empty |
| number / duration | =, ≠, >, <, ≥, ≤, between, is empty |
| select | is any of, is none of, is empty |
| multiselect | has any of, has all of, has none of |
| date | is, before, after, on/before, on/after, within (last/next N), is empty |
| boolean | is checked, is unchecked |

Compile the predicate tree once per query into a row test the worker applies;
push equality/range predicates down to indexed columns where they exist (Phase 5).

## Definition of done

- [ ] Filter, sort, group, hide-fields, kanban, calendar and gallery are all live and driven by **saved views** that persist and **sync across staff devices** (folded from `_schema.views.*`).
- [ ] On a 1M-row set: open / switch / filter / group / search each meets `PERF-BASELINE.md` — first paint ≤ 500 ms, search keystroke ≤ 100 ms input latency, main thread never blocked > 50 ms in steady state.
- [ ] The full 1M object graph never exists in `state.entities`; memory scales with open views' columns + one viewport of rows.

## Sequencing & payoff

| Phase | Effort | Ships |
|---|---|---|
| 1 Spine (worker + streaming + store + `query()`) | 1–1.5 wk | fast queryable store; unblocks everything + the whole perf story |
| 2 Real filter/sort/group/hide | 1 wk | **the "up and running" ask** |
| 3 Kanban / calendar / gallery | 1–1.5 wk | the Airtable view set |
| 4 Saved views as schema-log | 0.5–1 wk | shareable, syncing views |
| 5 1M hardening | 1 wk | the literal 1M bar + fast reopen |

~5–6 weeks to the full deliverable; **Phases 1–2 (≈2.5 wks) already put a real,
fast, filterable/sortable/groupable Airtable-grade grid in front of staff.**

## Deliberately NOT in scope

- Field/table editor UI (create/rename/retype fields, edit select options, author formulas in the UI) — genuine fast-follow, not a blocker.
- Client portal, row-level permissions, public forms — removed by the staff-only decision.
- Multi-tenant, theming, page builder — removed by the single-tenant decision.

## Immediate next step

Phase 1 is the gate. The concrete first PR is `public/rows.worker.js` +
`rowStore.query()` + the streaming parser replacing `parseCSV`, with `buildTable`
/ `listSets` / the grid re-pointed at the store. Everything else is renderers on
top.
