# AMINO — Performance baseline

*Data-layer numbers for the query spine (`public/row-store.js` +
`public/rows-materialize.js`), measured with `scripts/bench-rowstore.mjs`.*

```
node --max-old-space-size=4096 scripts/bench-rowstore.mjs 1000000
```

The benchmark exercises the **real** modules end to end — streaming parse +
materialize → columnar `loadSet` → `query()` (window / filter / group / sort /
search) — at 10k / 100k / 500k / 1M synthetic immigration rows. It measures the
data layer where the `O(N)` walls the plan targets actually lived; it does **not**
render the DOM (that's the browser's job), so treat these as the store/query
budget, not full first-paint-to-pixels. Single run, one machine — indicative,
re-run on the target hardware for authoritative numbers.

## Results

All times in ms. `parse+materialize` and `loadSet` are one-time per import (the
worker keeps them off the main thread); every `query()` row returns only the
requested window + counts.

| Rows | parse+materialize | loadSet | first paint (page 1) | filter `is` (cached idx) | group counts | sort page 1 | search (linear) | peak RSS |
|------|------|------|------|------|------|------|------|------|
| 10k   |   38 |   8 | 0.5 | 0.2 |  3 |   7 |   8 |  88 MB |
| 100k  |  273 |  60 | 0.5 | 0.3 |  9 |  14 |  38 | 191 MB |
| 500k  | 1284 | 271 | 0.6 | 0.5 | 35 | 169 | 261 | 587 MB |
| 1M    | 2642 | 800 | 0.5 | 0.9 | 67 | 111 | 334 | 771 MB |

Notes:
- **First paint** and **cached-index filter** stay ~flat (≈0.5 ms) from 10k→1M —
  they touch one window, not the set. This is the whole point of the spine.
- **`is` / `isAnyOf`** ride the lazy per-field value index (equality pushdown);
  the first such query on a field pays a one-time index build (~100 ms at 1M),
  then subsequent ones are sub-millisecond. Kanban's per-group queries use it.
- **Group** and **sort** are inherently over the whole set; both stay well under
  the interactive bar at 1M. A precomputed sort permutation (Phase 5 follow-up)
  would cut sort further.
- **Free-text search** is still a linear column scan (334 ms at 1M) — the one
  place a token/postings inverted index (Phase 5 follow-up) is still owed.

## Acceptance bar (definition of done) — status

On a 1M-row set, data layer:

- First paint of a page **≤ 500 ms** → **0.5 ms** ✅
- Switching tabs / filtering / grouping **≤ 200 ms** → group 67 ms, sort 111 ms, filter <1 ms ✅
- Search results page **≤ 150 ms** → **334 ms linear** ⏳ (needs the search index)
- Peak heap scales with columns + one viewport, **not** the full object graph —
  the 1M rows live in the columnar store, never in `state.entities` ✅ (RSS 771 MB
  holds the columns; the transient row objects are dropped after `loadSet`)

Still to validate **in the browser** (out of scope for this headless harness):
main-thread never blocked > 50 ms in steady state (the worker offloads parse +
materialize), scroll-to-load with no dropped frames, and cold-open time once the
OPFS materialization cache lands.
