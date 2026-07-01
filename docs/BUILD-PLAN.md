# AMINO — Build plan: configurable views on a store that scales to 1M

*Single-tenant (RK Lacy Law), staff-only. Supersedes the phase **sequencing** in
`SCALING.md`; that doc remains the deep-dive on the perf internals this plan
depends on.*

## Scope locked

- **Target:** run this one firm well — *not* a generic Airtable/Softr competitor.
  → The hardcoded firm layouts (`LORDER`, the CRM record panel) stay. No page
  builder, no theming config, no multi-tenant.
- **Users:** staff only. → **Matrix room membership is the entire permission
  model.** This removes the hardest work outright: no row-level "client sees own
  record" gating, no public/shared read path, no client-facing intake forms, no
  reconciling E2EE-room-membership against single-record access. All deferred /
  out of scope.
- **First to work:** configurable **views** — filter, sort, group, kanban,
  calendar (+ gallery).

## The one idea this plan turns on

**Views and the 1M-record goal are the same problem.** Filter / sort / group /
kanban-by-field / calendar-by-date are all *queries*. Build one query layer and:

- every view is a **preset** of that query, and
- "no slowdown at 1M" is just a **property of the store** the query runs against
  (indexed, columnar, off the main thread).

Build them separately and you fight the `Object.values().filter()` wall twice.
Build the query layer once and views come nearly for free *and* stay fast at 1M.

## The spine: one query API

Everything hangs off a single call, worker-hosted, over the columnar per-set
store from `SCALING.md` Phase 2:

```
rowStore.query(set, {
  filter,   // predicate tree: {op:'and', clauses:[{field,op,value}, ...]}
  sort,     // [{field, dir}]   (multi-key)
  group,    // {field}          (for kanban / grouped grid)
  search,   // free text (existing behaviour, now indexed)
  fields,   // visible columns
  offset, limit
}) -> { page: Row[], total: number, groups?: {key, count}[] }
```

- Returns **only the requested window** plus counts — never a 1M array.
- Lives in `public/rows.worker.js`, fed by the **streaming parser**
  (`SCALING.md` Phase 1), so a huge set never blocks the tab.
- The grid, kanban, calendar and gallery are all thin renderers over this one
  call. Nothing above the store ever iterates the full set again.

This single foundation is what makes **both** "configurable views" **and** "1M
with no slowdown" true at the same time.

## Views are schema (the on-model move)

Don't invent a view store. A saved view is emitted as a `DEF` with
`anchor=null, path='_schema.views.<name>'` — the exact mechanism the schema
already uses — and folds into `state.schema.views`:

```json
{ "_schema.views.OpenAsylum": {
    "set": "Client Info", "type": "kanban",
    "group": "Case Status",
    "filter": {"op":"and","clauses":[{"field":"Relief Sought","op":"is","value":"Asylum"}]},
    "sort": [{"field":"NTA Date","dir":"asc"}],
    "fields": ["Family Name","First Name","A#","NTA Date"]
} }
```

Because it's just more log, a teammate who opens the room **folds the same saved
views** — view sharing across the firm's devices with zero new infrastructure,
fully consistent with the append-only design.

## Build order

### Phase 1 — The spine *(worker + streaming parse + columnar store + `query()`)*
This is `SCALING.md` Phases 1–3 collapsed into the foundation, because the store
now serves views too. Deliver `rowStore.query` with filter/sort/group/search/
pagination, worker-hosted, streaming-fed. **Nothing else in this plan can start
until this exists** — so it's first, and it's also the entire perf story.
*Est. 1–1.5 wks.*

### Phase 2 — Make the painted toolbar real
`amino-app.js` line ~760 already renders `Hide fields / Filter / Sort / Group`
as dead buttons. Wire each to a `query()` param:
- **Filter** — a small builder UI producing the predicate tree; per-type
  operators (below). Replaces today's single `match` search-only path.
- **Sort** — multi-key, drag to reorder.
- **Group** — group-by a field → grouped grid (and the substrate for kanban).
- **Hide fields** — the `fields` param; today's `dbShowAllCols` becomes per-view
  field visibility.
*Est. 1 wk. This is the "up and running first" deliverable.*

### Phase 3 — View types (thin renderers over `query()`)
- **Kanban** — `group` by a single-select field; each column is a windowed
  `query()` with that group's filter; cards are windowed like the grid already
  windows rows.
- **Calendar** — `filter` to a visible date range over a chosen date field
  (you already have date coercion + a `date` field type); lay cards out by day.
  Retire the hardcoded hearings/deadlines lists in favour of a real view over
  the `NTA Date` / `Hearing` / due-date fields.
- **Gallery** — the grid `query()` with a card layout. Nearly free.
*Est. 1–1.5 wks.*

### Phase 4 — Saved views as `_schema.views.*`
View switcher per table; each view persists `{type, filter, sort, group,
fields}` as a schema-log DEF; folds + syncs. A "star" / default view per set.
*Est. 0.5–1 wk.*

### Phase 5 — 1M hardening (the rest of `SCALING.md`)
Persist the columnar materialization to its own OPFS file keyed by
`import_seq` (skip re-parsing the blob on every cold open); link/adjacency index
for related-records; per-field inverted index for instant search/sort at 1M.
Rides *after* views ship because at the firm's real volume the Phase-1 store is
already fast — this is headroom to hit the literal 1M bar.
*Est. 1 wk.*

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

## Deliberately NOT in scope (scope discipline)

- **Field/table editor UI** (create/rename/retype fields, edit select options,
  author formulas in the UI). Views only need to *select* an existing field to
  group/sort/filter by, not edit schema. Genuine fast-follow, not a blocker.
- **Client portal, row-level permissions, public forms** — the staff-only
  decision removes these entirely.
- **Multi-tenant, theming, page builder** — the single-tenant decision removes
  these.

## Definition of done

- Filter, sort, group, hide-fields, kanban, calendar and gallery are all live
  and driven by **saved views** that persist and **sync across staff devices**
  (folded from `_schema.views.*`).
- On a 1M-row set: open a view, switch views, filter, group, search — each meets
  the `PERF-BASELINE.md` targets (first paint ≤ 500 ms, search keystroke ≤ 100 ms
  input latency, main thread never blocked > 50 ms in steady state).
- The full 1M object graph never exists in `state.entities`; memory scales with
  open views' columns + one viewport of rows.

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

## Immediate next step

Phase 1 is the gate. The concrete first PR is `public/rows.worker.js` +
`rowStore.query()` + the streaming parser replacing `parseCSV`, with `buildTable`
/ `listSets` / the grid re-pointed at the store. Everything else is renderers on
top.
