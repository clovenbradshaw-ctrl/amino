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

- [ ] Kanban — group by a single-select; each column a windowed `query()`
- [ ] Calendar — filter to a visible date range over a chosen date field
- [ ] Retire hardcoded hearings/deadlines lists in favour of a real view over `NTA Date` / `Hearing` / due-date
- [ ] Gallery — the grid `query()` with a card layout (nearly free)

### Phase 4 — Saved views as `_schema.views.*` · *0.5–1 wk* 🟣

- [ ] Emit a view as a `DEF` (`anchor=null, path=_schema.views.<name>`)
- [ ] View switcher per table; persist `{type, filter, sort, group, fields}`
- [ ] Star / default view per set
- [ ] Folds + syncs across staff devices (zero new infrastructure)

### Phase 5 — 1M hardening · *1 wk* ⚫

- [ ] Persist the columnar materialization to its own OPFS file, keyed by `import_seq` (skip re-parse on cold open)
- [ ] Link / adjacency index for related records (resolve in O(degree))
- [ ] Per-field inverted index for instant search/sort at 1M (`A#`, `Family Name`, `First Name` eagerly)
- [ ] Meet `PERF-BASELINE.md` targets on a 1M set

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
