# Spec 0003: Hub Data Foundation

## Goal

A user opening Hub sees Customer, Registered Application, and Jobs list pages backed by a real SQLite database (seeded with a starter Customer/Application/Runner), can navigate to them from the chrome nav, and can open a Start Training modal that shows its planned inputs and validates them — with the Job Screen itself untouched (still hardcoded mock data).

## Requirements

- R001: Hub persists data in SQLite; schema changes are managed as versioned migrations via dbmate, runnable independently up/down against a specified database.
- R002: The database location is configurable at startup (env var), so automated tests can point at a separate database file than the one used for `npm run dev:hub`.
- R003: A fast reset path exists for tests to clear user-written data between runs without re-running migrations from scratch.
- R004: Tables exist for `customer`, `application`, `customer_application_xref`, `runner`, `recipe_status`, and `recipe`, per the columns in [Requirements detail](#schema) below.
- R005: `recipe_status` is seeded with system rows using explicit, hardcoded `id` values (`1=Draft`, `2=Released`, not autoincrement) matching a TypeScript enum of the same values, so application code maps enum ↔ row by a literal integer with no DB lookup required.
- R006: A startup seed step inserts one Customer, one Application, one `customer_application_xref`, and one Runner if they don't already exist, so a freshly-migrated database is immediately usable.
- R007: A Customers list page links to each Customer page, which shows the customer's name and its registered applications, linking into each (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#user-interface)).
- R008: A Registered Applications list page links to each Registered Application page (Customer × Application), which shows its registered Runners (with `last_heartbeat_on`) and a "Begin a Training Run" action that opens the Start Training modal.
- R009: A Jobs list page exists and renders with no jobs (static — no `job` table or API yet); the existing hardcoded Job Screen at `/jobs/[id]` is unchanged.
- R010: Chrome nav links to the Customers, Registered Applications, and Jobs list routes now that they exist (replacing the current placeholder "Customers, Runners, Jobs" labels).
- R011: The Start Training modal shows the planned inputs — goal statement, starting URL, maximum steps (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#training-mode) Training Mode Step 1) — and displays client-side validation messages for missing/invalid values. Submitting does not create a Job (no `job` table/API yet).
- R012: New collection/item reads follow the [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md) under `src/hub/src/routes/api/hub`.
- R013: `db:reset` (Step 2) leaves the database in the same seeded baseline as a fresh startup (Step 4's seed), so it can be run between test files without needing a hub restart.

### Schema

Lowercase-with-underscores names; each table's own key is `id`; foreign keys are `<table>_id`. SQLite has no native timestamp type — `last_heartbeat_on` and other dates are stored as ISO-8601 text.

- `customer`: `id`, `name`
- `application`: `id`, `name`
- `customer_application_xref`: `id`, `customer_id`, `application_id`
- `runner`: `id`, `customer_application_xref_id`, `last_heartbeat_on`
- `recipe_status`: `id`, `name` — seeded, mirrored as a TS enum
- `recipe`: `id`, `customer_application_xref_id`, `recipe_status_id`, `version`, `name`, `goal`, `definition`, `created_at`, `published_at`
  - `definition` is a JSON/text blob, not decomposed into columns, per [recipe.md](../../todos/supporting-docs/recipe.md).
  - `sourceTrainingRunId` from recipe.md is dropped — no `training_run` table exists yet; re-add when Training Runs are persisted.

## Constraints

- C001: No `job` table or Job API in this spec — Jobs list is empty and the Job Screen keeps its hardcoded mock data (0002-hub-visuals scope untouched).
- C002: Registered Application and Customer pages have no design mockup — build them with existing design-system tokens/mixins and panel/button components from `styles/mixins/`, no new visual language.
- C003: Create/Update/Retire for Customer, Application, and Runner are FUTURE per architecture — this spec only reads/seeds them.
- C004: SCSS tokens only, local-first `_components`, per [conventions.md](../../context/hub/conventions.md).
- C005: New API routes follow [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md) — GET envelopes, no server-generated fields accepted from clients.
- C006: `db/migrations` and the SQLite driver are a new architectural dependency — draft an ADR (via `write-adr`).
- C007: System-defined data (rows inserted by migrations, e.g. `recipe_status`) is distinct from user-defined data (rows inserted by Step 4's seed or normal app use) — `db:reset` (R013) clears only user-defined tables/rows and never touches migration-seeded rows.

## Sequencing

Step 1's e2e guards stay red until Step 6 (nav/list pages) and Step 7 (modal) land. Steps 2-5 build the database bottom-up (tooling → schema → seed → API) before anything user-visible.

---

### Step 1 — E2E guards for new pages and the Start Training modal

**Guard:** new `src/hub/e2e/customer.spec.ts`, `registered-application.spec.ts`, `jobs.spec.ts`, and an addition to (or new) `start-training-modal.spec.ts`; all red until Steps 6-7.

**References**
- [Hub e2e conventions](../../context/hub/e2e/conventions.md)
- [ARCHITECTURE.md — User Interface](../../../ARCHITECTURE.md#user-interface)

**Work:**
- Assert the Customers list links to the seeded Customer; assert the Customer page shows its name and its Application link.
- Assert the Registered Applications list links to the seeded Registered Application; assert that page lists the seeded Runner and its heartbeat, and has a "Begin a Training Run" action.
- Assert the Jobs list page renders with no jobs.
- Assert chrome nav links navigate to these three routes.
- Assert the Start Training modal shows goal/URL/max-steps fields and shows validation messages when submitted empty.

---

### Step 2 — Database tooling

**Guard:** `npm run db:migrate:up` / `db:migrate:down` work against a scratch database file; a reset script empties user-defined data (and re-seeds it) without touching system-defined (migration-seeded) rows or re-running migrations.

**References**
- [dbmate](https://github.com/amacneil/dbmate) CLI, invoked via the npm `dbmate` package/`npx`

**Work:**
- Add `db/migrations/` under `src/hub`; wire `db:migrate:up`, `db:migrate:down`, `db:migrate:new` npm scripts calling dbmate with a `sqlite:` URL.
- Add a `HUB_DATABASE_URL` env var (`.env.example` committed, `.env` gitignored) read at hub startup to open the SQLite connection; default points at `.data/hub.db` (gitignored). Playwright's config points it at a separate test database file.
- Add a `db:reset` script that deletes all rows from the user-defined tables only (`customer`, `application`, `customer_application_xref`, `runner`, `recipe` — not `recipe_status`, not dbmate's own `schema_migrations`), then re-runs Step 4's seed function, for fast reuse between e2e runs — faster than deleting/recreating the file and replaying every migration, and safe to call against the same file the running hub process (Playwright's single `webServer`) already has open, since it's a separate short-lived connection.
- Draft an ADR (via `write-adr`) for SQLite + dbmate + the driver package chosen (e.g. `better-sqlite3`) over alternatives.

---

### Step 3 — Schema migrations

**Guard:** `db:migrate:up` creates all tables; `recipe_status` has exactly the two seeded rows; a unit test asserts the TS enum values match.

**References**
- [recipe.md](../../todos/supporting-docs/recipe.md)
- [Schema](#schema) above

**Work:**
- Add one migration per table (or a single initial migration) for `customer`, `application`, `customer_application_xref`, `runner`, `recipe_status`, `recipe`, with FKs per [Schema](#schema).
- Seed `recipe_status` rows in the migration itself via explicit `INSERT ... (id, name) VALUES (1, 'Draft'), (2, 'Released')` — explicit ids, not autoincrement — since this is system data (not the startup seed script) and `db:reset` (Step 2, C007) must never delete it.
- Add the matching `RecipeStatus` TS enum.

---

### Step 4 — Startup seed script

**Guard:** a unit/integration test asserts running the seed twice leaves exactly one Customer/Application/xref/Runner row (idempotent).

**Work:**
- Add a seed function inserting one Customer, Application, `customer_application_xref`, and Runner only if none exist yet ("if not exists"); call it from hub startup (e.g. `hooks.server.ts` or an init module) and, per R013, from Step 2's `db:reset`.

---

### Step 5 — Read APIs

**Guard:** a unit/integration test per endpoint asserting the response envelope shape from [api-request-response-conventions.md](../../context/hub/backend/api-request-response-conventions.md).

**References**
- [API calling pattern](../../context/hub/frontend/api-calling-pattern.md)

**Work:**
- Add `src/hub/src/routes/api/hub/customers`, `.../customers/[id]`, `.../registered-applications`, and `.../registered-applications/[id]` (the last returning a `customer_application_xref` row joined with its Runners).
- No `jobs` API — the Jobs list page (Step 6) renders statically empty; add the endpoint only once a `job` table exists.
- Add the corresponding typed API-calling module(s) per the frontend convention.

---

### Step 6 — Customer, Registered Application, and Jobs list pages

**Guard:** Step 1's `customer.spec.ts`, `registered-application.spec.ts`, and `jobs.spec.ts` pass.

**References**
- [ARCHITECTURE.md — User Interface](../../../ARCHITECTURE.md#user-interface)
- [Hub components conventions](../../context/hub/frontend/components.md)

**Work:**
- Add list routes `src/hub/src/routes/customers/+page.svelte` and `.../registered-applications/+page.svelte` (fetching Step 5's collection APIs), each linking to its `[id]` detail route.
- Add detail routes `src/hub/src/routes/customers/[id]/+page.svelte` and `.../registered-applications/[id]/+page.svelte`, with local `_components`, fetching from Step 5's item APIs.
- Add `src/hub/src/routes/jobs/+page.svelte` (static, no jobs — see Step 5).
- Update `AppChrome.svelte`'s nav items to link to `/customers`, `/registered-applications`, `/jobs` (replacing the placeholder labels/comment) — "Runners" becomes "Registered Applications".

---

### Step 7 — Start Training modal

**Guard:** Step 1's modal e2e assertions pass.

**References**
- [ARCHITECTURE.md — Training Mode](../../../ARCHITECTURE.md#training-mode)

**Work:**
- Add a modal (opened from the Registered Application page's "Begin a Training Run" action) with fields: primary goal statement, starting URL, maximum steps.
- Client-side validation: all three required, URL must be a valid URL, maximum steps a positive integer; display messages inline on submit.
- Submitting does nothing further yet (no Job created) — leave a clear TODO-style note in code, not a fake success message.

---

### Step 8 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- Run `write-agent-context` for topic `database-handling`, area `hub`: migration workflow (`db:migrate:up/down/new`), the `HUB_DATABASE_URL` env var and test override, and the `db:reset` fast-path for tests.
- Move the Step 2 draft ADR into `docs/adrs/hub/`.
- Confirm every file under `docs/context/hub` is linked from `_index.md`; fix any that aren't.

---

## Out of scope

- `job` table, Job API, and any change to the Job Screen or its mock data.
- Starting a real Job from the Start Training modal.
- Customer/Application/Runner create, update, or retire (FUTURE per architecture).
- Runner registration flow.
- Paging, filtering, or search on any list.
- Recipe list/detail UI (only the table + seeded status exist this spec).
- Recent Job history and intervention-required Jobs on the Customer page (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#user-interface) item 1) — blocked on the deferred `job` table.

## Traceability

- Source: [docs/todos/0002-01-pages-to-jobs.md](../../todos/0002-01-pages-to-jobs.md) item 2 "Hub Visuals & API & Database"
