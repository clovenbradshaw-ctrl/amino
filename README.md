# AMINO Immigration — RK Lacy Law

Encrypted case-management (CRM) for an immigration law firm. The interface is the
handed-off design prototype; the data layer underneath it is **real** — there is
no database, no API tier and no app-managed auth.

> Rooms are tables. Events are rows. `fold(events)` is the query. A stock Matrix
> homeserver stores only end-to-end-encrypted ciphertext it cannot read.

This app **draws its functionality from two other repositories** and adds the
immigration-firm UI + data model on top:

| Capability | Comes from |
|---|---|
| Auth, E2EE, rooms, sync, the operator algebra + `fold` | **[bare-metal-eo-matrix-app](https://github.com/clovenbradshaw-ctrl/bare-metal-eo-matrix-app)** — vendored as the foundation in [`src/`](src/) + the runtime helpers in [`public/`](public/) |
| The "Ask your data" reading engine (Cleo) | **[eoreader3](https://github.com/clovenbradshaw-ctrl/eoreader3)** — loaded lazily at runtime by [`public/data-chat.js`](public/data-chat.js) |
| The visual + interaction spec (the UX) | the `Customizable Record Panel` prototype, lifted into [`ui/amino-template.html`](ui/amino-template.html) |

## How it works

- **Sign in = Matrix login.** The homeserver is hardcoded to
  `https://app.aminoimmigration.com`; the screen only asks for a Matrix ID +
  password. The password unlocks the user's own account and E2EE keys on the
  device — there is no credential store and **no API keys to leak**. The same
  screen also offers **Explore demo data** — a no-homeserver path that seeds a
  few example workspaces locally so the app is fully explorable offline (nothing
  leaves the browser; demo edits persist in `localStorage`).
- **Pick a space on sign-in.** Signing in (or entering demo) lands on a
  **spaces launchpad** that lists every workspace you can open as a card —
  rather than dropping silently into one. **A workspace is a room**: live
  workspaces are the encrypted rooms you belong to (`MatrixLive.listRooms()`),
  and **membership is the access model** — a teammate sees only the workspaces
  the admin invited them to. The live path has **no seed data** (every client,
  case and note is folded from a room's timeline); only the demo path seeds
  example spaces, through the very same fold.
- **Every edit is one stored operator.** A field edit emits **`DEF`**
  (`anchor`, `path = <Field Name>`, `value`); a new client/note emits **`INS`**;
  a relationship emits **`CON`**. State is never stored — it is always
  `fold(timeline)`, recomputed live on every change.
- **Ask your data** (`public/data-chat.js` + `chat-view.jsx`) reads the same fold
  and never writes; the Cleo engine streams in from the eoreader3 deployment.

The seam between the UI and the backend is small and lives in
[`ui/amino-app.js`](ui/amino-app.js): `connect()` → `MatrixLive.login`,
`refold()`/`buildClients()` → `MatrixEngine.fold`, `setVal`/`addNote`/`addClient`
→ `MatrixLive.emit(room, OP.DEF|INS|CON, …)`, and `MatrixLive.subscribe()` drives
live re-folds.

## What you can do in the UI

- Sign in against the firm homeserver (ID + password; homeserver pre-filled),
  or **Explore demo data** to load example workspaces locally (no homeserver).
- **Pick a workspace** from the spaces launchpad shown right after sign-in;
  return to it any time via **All spaces** (left rail).
- Switch between **workspaces** (left rail) — each is an encrypted room.
- **New workspace** (rail) and **Invite teammate** (toolbar) — `createRoom` +
  `inviteUser`. Inviting a teammate is what grants them access to that workspace.
- **New client** (toolbar) → `INS('client')`; edit any field inline → `DEF`;
  add a case note → `INS('note')`. The customizable Record Panel, record tabs,
  Related Individuals (CON edges) and the Airtable-style Database view all render
  from the fold.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # → dist/ (plain static files; no server side)
npm test             # foundation suite + the fold→UI projection test
```

`index.html` is **generated** from `ui/amino-template.html` (the markup) and
`ui/amino-app.js` (the wired Component) by `scripts/assemble-index.mjs`, which runs
automatically via the `predev`/`prebuild` hooks. **Edit the `ui/*` sources, not
`index.html`.**

To point the app at a homeserver other than the hardcoded one (e.g. a local dev
Synapse), change `HOMESERVER` in `ui/amino-app.js`.

**Namespaces.** Live data is written by the foundation bridge under
`io.matrix-events` (`NAMESPACE` in `src/main.js`, exposed as
`MatrixLive.NAMESPACE`), so amino folds live rooms under *that* namespace — this
is what lets it read the data already imported via the bare-metal app. Demo seed
spaces use `app.aminoimmigration`. The fold engine's namespace is aligned to the
active source before every fold (`applyEngineNS` in `ui/amino-app.js`).

**Imported sets → CRM.** Bulk Airtable/CSV imports are stored as a derived
"set" (schema + one source blob, rows materialized on read), not per-row events.
`public/import-rows.js` reconstructs those rows; amino projects the firm's
**Client Info** set into the client list / record panel / Database view
(`projectLive` / `materializeLive` in `ui/amino-app.js`).

## Deploy

Push to `main` → the GitHub Action (`.github/workflows/deploy.yml`) runs the
tests, builds, and publishes `dist/` to GitHub Pages (project base `/amino/`; set
`AMINO_BASE=/` when hosting at the firm's own domain root).

## Layout

```
src/            vendored matrix-events foundation (auth, crypto, rooms, fold, media, …)
public/         runtime: dc-runtime.js, engine.js, formula.js, data-chat.js, vendored React,
                fonts + logo (assets/), Amino.schema.json, PWA shell
ui/             EDITABLE UI sources — amino-template.html (UX) + amino-app.js (wired Component)
scripts/        assemble-index.mjs (generates index.html)
test/           foundation tests + amino-app.test.mjs (fold → projection → render)
docs/           PROMPT.md (engineering brief), BUILDING.md, ENCRYPTION-DESIGN.md, MEMORY.md, MATRIX-EVENTS.md
```

## Scope

Wired and verified here: real Matrix login, workspace discovery/switching,
per-workspace fold → client/case/note projection, operator emits for every
mutation, invite-based access, live re-fold, and the Ask-your-data bridge.

Out of scope for this repository (operational, per [`docs/PROMPT.md`](docs/PROMPT.md)):
standing up the `app.aminoimmigration.com` homeserver with E2EE enforced,
creating the firm's user accounts, and the one-time Airtable → rooms data import.
The client code paths for all of these are in place; they need a live homeserver
to exercise end-to-end.
