# AMINO — Scaling to 1M records with no perceptible slowdown

*Roadmap against the current `main` (matrix-events foundation + import-blob CRM + windowed Database grid).*

## The one architectural fact everything else follows from

The **DOM is already solved.** `DB_PAGE = 100` (grows +300 on scroll) means the grid never mounts more than a few hundred rows regardless of set size, and `MAX_CLIENTS = 4000` caps the CRM list. A 1M-row sheet will not blow up the DOM.

Every remaining bottleneck lives in **the data layer between the import blob and that window**, and they all share one shape:

> **Materialize the entire set into a single in-memory `entities` object, then `Object.values(entities).filter(e => e._type === t)`.**

That pattern appears in `materializeImportRows` → `augmentState` → `buildTable` → `listSets` → the search `match`. It is O(N) in the *whole dataset* on every rebuild even though only 100 rows ever render, it allocates million-key objects and million-element arrays per pass, and **it all runs on the main thread.** Perfectly fine at the 12k rows the code comments target; a hard wall at 1M.

The fix, stated once: **make the in-memory working set bounded by the viewport, not the dataset.** Everything below is a phased path to that, ordered so each phase ships a real improvement on its own.

## What NOT to touch (these are already right)

- **The blob model.** Bulk imports are stored as one `import` entity (schema + `field_plan` + media blob), *not* per-row events. Do **not** "fix scale" by exploding 1M rows into 1M `INS`/`DEF` events — that would destroy the fold, the OPFS store, and the sync path all at once. The blob is the correct primitive; the problem is only how it's read.
- **The append-only fold + per-room cache.** `foldRoom`'s prefix-check + incremental `foldFrom(cache.state, tail)` keeps edits O(k in new events). Keep it. 1M *edits* is a different (and later) problem than 1M *imported rows*.
- **DOM windowing** (`dbLimit`, scroll-grow, the `built.rows.filter(match).slice(0,limit)` window). Keep it; extend it downward into the data layer.

## Where it breaks — the honest benchmark table

| # | Operation | File / function | Cost at 1M | Symptom |
|---|-----------|-----------------|-----------|---------|
| 1 | Parse the whole blob synchronously | `import-rows.js` `parseCSV` + `.map` | O(N) chars + N object allocs, blocking | Tab freezes for seconds→minutes; possible OOM on a multi-hundred-MB CSV |
| 2 | Inject all rows into a fresh entity map | `db-data.js` `augmentState` (`for…of` + `Object.assign`) | Reallocates a 1M-key object on every render-state bump | GC storms; each blob completion / `_renderVer++` re-copies 1M refs |
| 3 | Extract one type's rows | `db-data.js` `buildTable` `Object.values(...).filter(...)` | O(N) scan + 1M-array alloc | First paint of a set; re-runs whenever the fold ver changes |
| 4 | Count rows per set | `db-data.js` `listSets` (`for e of Object.values` + `.filter` per name) | O(N) + O(N·sets) | Every Database render, before you even pick a table |
| 5 | Search | `amino-app.js` `match` over `built.rows` | O(N · cols) per query | Search over a large set scans all rows × all columns |
| 6 | Resolve links | `augmentState` link pass + `db-data.js` `linksFromAnchor` | O(edges) per anchor; link index rebuilt per augment | Related-records slow; CON scans are linear |
| 7 | Persist / reopen | `store.js` `_scanFromOPFS` + blob re-read | Re-decrypt + re-decode + re-parse the blob every cold open | Slow workspace open; nothing survives as materialized rows |
| 8 | Everything above | — | **All on the main thread** | No worker anywhere in `src/` or `public/` |

## The roadmap

### Phase 0 — Instrument and set the bar *(≈1 day)*

You can't tune what you can't see. Before changing anything:

- Add a `perf` harness that seeds a synthetic import at 10k / 100k / 500k / 1M rows (reuse the real `field_plan` shape) and logs wall-clock for: blob parse, `augmentState`, `buildTable`, first `listSets`, one search, one link resolution.
- Define the acceptance bar (this is your "done"): **open a 1M-row set and first-paint ≤ 500 ms; type a search char with ≤ 100 ms input latency; scroll a page with no dropped frames; main thread never blocked > 50 ms in steady state.**
- Commit the numbers as `docs/PERF-BASELINE.md`. Every later phase reports against it.

### Phase 1 — Get parse + materialize off the main thread *(the single biggest win)*

Two changes, both self-contained:

1. **Stream the parse.** Replace the char-by-char `parseCSV` + full `.map` with a streaming reader. Fetch the media blob as a `ReadableStream`, run it through a chunked CSV/JSON parser, and emit rows in batches instead of building one giant array. (PapaParse in worker+step mode is the drop-in; a hand-rolled chunked variant of your existing parser is fine too and keeps the zero-dependency posture.)

2. **Move materialization into a Web Worker.** Add `public/rows.worker.js`. `materializeImportRows` becomes: post `{blobRef, field_plan, setName, shape}` to the worker, receive back a **compact columnar batch** (see Phase 2), never touch the main thread with the raw text. Comlink is optional sugar; raw `postMessage` matches the repo's no-framework style.

After Phase 1, importing/opening a huge set no longer freezes the tab — it fills in progressively, exactly like the grid comment already promises ("*the Database grid fills in as each blob streams in*"), just at 100× the scale.

### Phase 2 — Stop materializing into one giant entity map *(kills bottlenecks #2–#4)*

This is the core refactor. Today `augmentState` merges 1M row-objects into `state.entities` and `buildTable` scans it. Replace that with a **per-set row store** that never enters `state.entities`.

- Introduce `AminoRowStore` keyed by `derived_set`. For each set, hold rows **columnar** (one typed array / string-interned column per field) rather than 1M heap objects. Columnar cuts memory ~3–5×, makes per-column scans cache-friendly, and makes sort/search indexable.
- Keep a **by-type row index** so the grid asks `rowStore.get(setName, {offset, limit})` instead of `Object.values(state.entities).filter`. `buildTable` becomes a thin adapter over the store — columns from `field_plan`, rows from a windowed slice.
- **Leave the fold entities alone.** Native `client`/`note` entities (thousands, event-sourced) stay in `state.entities`; only the imported *blob* rows move to the row store. The grid's tab list is `fold-entity types ∪ row-store sets` — one merge, no full scan.
- `listSets` counts come from `rowStore.count(set)` (O(1), maintained on load) plus the small fold-entity tally — never a 1M `Object.values` walk.

Acceptance for Phase 2: `buildTable` and `listSets` are **O(window), not O(N)**. Opening a 1M set touches only the first `DB_PAGE` rows.

### Phase 3 — Push filter / sort / search below the fold *(kills #5)*

Right now search is `built.rows.filter(match).slice(0, limit)` — materialize-then-filter. Invert it:

- Search, sort, and column filters become **queries against the row store** that return only the windowed page: `rowStore.query(set, {search, sort, filters, offset, limit})`.
- Back a full-text-ish search with a lightweight per-set inverted index (token → row-id postings) built once at load in the worker, so a keystroke is a postings lookup + page slice, not a 1M-row scan. For the immigration CRM the high-value indexed fields are `A#`, `Family Name`, `First Name` — index those eagerly, fall back to linear scan only on rare columns.
- Sorting large sets: precompute a sort permutation per column in the worker on demand; the grid reads `rowStore.page(sortKey, dir, offset, limit)`.

### Phase 4 — Persist the materialized store; don't re-parse the blob every open *(kills #7)*

Today a cold open re-reads, re-decrypts, re-decodes, and re-parses the entire blob. Cache the *output* of materialization:

- After the worker materializes a set, write the columnar batch to **its own OPFS file** (vault-encrypted, same envelope as `store.js`), keyed by `importEntity._anchor` + `import_seq`. On open, if the cached materialization matches the current active import generation, load columns directly and skip parse entirely.
- This reuses your existing `activeImports` (import_group / monotonic import_seq) logic for invalidation — a re-sync bumps `import_seq`, the cache misses, you re-materialize once. One-off imports never re-parse after the first open.

### Phase 5 — Relational links at scale *(kills #6)*

- Build the record-id → anchor index (`augmentState`'s `idIndex`) **once per set in the worker** and persist it alongside the columnar cache. `_linkRefs` → CON derivation becomes a lookup, not a re-scan on every augment.
- Replace `linksFromAnchor`'s linear `connections` scan with an **adjacency index** (anchor → edges) maintained incrementally as connections are added. Related-Individuals and the join columns then resolve in O(degree), not O(edges).

### Phase 6 — Stretch: true out-of-core for the 10M case

If sets outgrow comfortable RAM (10M+ rows, or many large sets open at once), graduate the row store to **`sqlite-wasm` on OPFS** (official `@sqlite.org/sqlite-wasm`, OPFS VFS) or an **Apache Arrow** columnar buffer with DuckDB-wasm for querying. At that point `rowStore.query` is literally SQL, pagination/sort/search/joins are the engine's job, and only the current page is ever in JS. This is the clean landing spot the Phase 2–3 API is designed to swing to without touching the UI — keep `rowStore.query/page/count` as the seam.

## Sequencing and payoff

| Phase | Effort | Unblocks | Ship-alone value |
|-------|--------|----------|------------------|
| 0 Instrument | ~1 day | measurement | baseline numbers |
| 1 Worker + streaming parse | 2–3 days | #1, #8 | **tab stops freezing** — biggest felt win |
| 2 Columnar row store | 4–6 days | #2, #3, #4 | open/switch sets stays instant at 1M |
| 3 Query pushdown | 3–4 days | #5 | search/sort instant |
| 4 Persist materialization | 2–3 days | #7 | fast cold opens |
| 5 Link/adjacency index | 2 days | #6 | relational views fast |
| 6 SQLite/Arrow-wasm | 1–2 weeks | 10M+ | headroom |

**Phases 1–3 alone clear the stated goal** ("1M records, no slowing down"). 4–5 make it feel native across reopen and joins. 6 is insurance for an order of magnitude more.

## Definition of done

On a 1M-row imported set, on a mid-range laptop, after Phase 3:

- First paint of the Database view ≤ 500 ms.
- Switching tabs / sets ≤ 200 ms.
- Search keystroke input latency ≤ 100 ms; results page returns ≤ 150 ms.
- Scroll-to-load a page: no dropped frames.
- Main thread never blocked > 50 ms in steady state (verify in Performance panel).
- Peak JS heap scales with **open sets' column memory + one viewport of row objects**, not with total row count — confirm the 1M object graph is gone.

## One caveat worth stating plainly

This roadmap scales **imported blob sets** to 1M — the realistic shape of a firm's Airtable/CSV migration, and the thing that breaks first. It does **not** by itself make 1M *event-sourced* mutations cheap; the fold is still a per-room in-memory reduce. That's a separate axis (checkpoint snapshots in `store.js` already hint at the fix: persist a folded checkpoint every N events and `foldFrom` the tail on open). It won't bite at a law firm's edit volume for a long time, but flag it so "1M records" and "1M edits" don't get quietly conflated.
