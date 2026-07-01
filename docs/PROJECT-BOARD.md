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
- [ ] `public/rows.worker.js` — host the row store off the main thread
- [ ] Streaming parser replaces `parseCSV` (fetch blob as a stream, emit row batches)
- [ ] Re-point `buildTable` / `listSets` / the grid at the store (read windows, not full sets)

> **Shipped so far:** the columnar store + `query()` spine landed as a
> standalone, headless-tested module (`public/row-store.js`), wired into the
> build (`assemble-index.mjs`) and the test suite. Next: move materialization
> into `public/rows.worker.js` with a streaming parser, then re-point the grid.

### Phase 2 — Make the painted toolbar real · *1 wk* · the "up & running" ask 🟠
*`amino-app.js` ~line 760 already renders Hide fields / Filter / Sort / Group as
dead buttons. Wire each to a `query()` param.*

- [ ] Filter builder UI → predicate tree (per-type operators, see below)
- [ ] Multi-key Sort (drag to reorder)
- [ ] Group-by a field → grouped grid (substrate for kanban)
- [ ] Hide fields → the `fields` param; `dbShowAllCols` becomes per-view visibility

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
