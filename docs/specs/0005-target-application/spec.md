# Spec 0005: Local Target Application

## Goal

A developer can start a self-contained, no-API legacy web application locally with one command, reach it from the host machine, and find it already populated with sample data — giving Runner development and e2e tests a real screen to instrument without anyone installing a database engine on their machine.

## Requirements

- R001: A target web application with no API (UI-only), matching the "Target Application" role in [ARCHITECTURE.md](../../../ARCHITECTURE.md#overview), runs locally.
- R002: The application and its database run fully inside containers; no database engine is installed on the host.
- R003: The application is reachable over HTTP from the host machine (where Runner and Playwright run).
- R004: The application starts already populated with sample data, with no manual seeding step.
- R005: Starting and stopping the target application is a single scripted command, consistent with existing `npm run` task conventions.

## Constraints

- C001: No local install of a database engine or the target application's language runtime on the developer machine — container-only.
- C002: The user's starting idea was BambooInvoice + MySQL in Docker; alternatives are acceptable if they meet R001-R005.
- C003: The application/tech selection is a third-party choice — recorded as [an ADR](../../adrs/tools/0000-use-bambooinvoice-in-docker-for-target-app.md). The ADR originally cited a `Magentron/BambooInvoice` fork for PHP8/MySQL8 compatibility fixes; that fork turned out to be an unmodified copy of the original `derekallard/BambooInvoice` repo at the same single (2009) commit, with no such fixes. The ADR now points at the original repo directly, running on PHP 5.6 + MySQL 5.7 (matching the app's actual vintage) instead.
- C004: The container tooling must work on both Docker and Podman (the user runs Podman on one development machine, Docker on another) — the compose file itself must avoid engine-specific features (e.g. `depends_on: condition: service_healthy`, which older `podman-compose` doesn't honor; the app container should wait-and-retry its DB connection instead), and the `dev:target-app:up`/`dev:target-app:down` scripts must auto-detect which compose command (`docker compose`, `podman compose`, or `podman-compose`) is available rather than hardcoding `docker compose`.

## Sequencing

Step 1 delivers and proves the containerized app. Step 2 moves the draft ADR to its permanent location and adds usage docs.

---

### Step 1 — Containerize BambooInvoice with seed data

**Guard:** `test-e2e/target-app.spec.ts`, picked up by the existing `npm run guard:tools:e2e` target — starts the compose stack, waits for both services' Docker healthchecks to pass, requests the app root over HTTP, and asserts a 200 response containing a known seeded value (e.g. a seeded customer or invoice name). Red until the work below is done.

**References**
- [npm task naming conventions](../../context/tools/npm-task-naming-conventions.md)
- `test-e2e/playwright.config.ts` and `test-e2e/runner-startup.spec.ts` for existing top-level e2e patterns
- [0000-use-bambooinvoice-in-docker-for-target-app.md](../../adrs/tools/0000-use-bambooinvoice-in-docker-for-target-app.md) for the source repo/version pinned and the config/env approach

**Work:**
- Add a `Dockerfile` that fetches the `derekallard/BambooInvoice` source at build time (`git clone` pinned to a specific commit SHA) rather than vendoring the source into this repo, keeping the app's third-party history out of our git history and this step's diff small.
- Add a `docker-compose.yml` with the app service and a MySQL service, a healthcheck on each service, MySQL data on a named volume, and the app service published on a fixed host port. Per C004, don't rely on `depends_on: condition: service_healthy`; have the app container's entrypoint wait-and-retry its DB connection until MySQL is ready.
- Add a MySQL seed script (`docker-entrypoint-initdb.d`) with a handful of sample customers/invoices so R004 is met on first boot with no manual step.
- Config/credentials (DB host/user/password, app base URL) are dev-only fixture values, not secrets — commit them directly or via a committed `.env.example`, matching the pattern used for `RUNNER_SHARED_SECRET` in `test-e2e/playwright.config.ts`.
- Add `dev:target-app:up` / `dev:target-app:down` npm scripts, per the `type:scope:variant` naming convention (`dev` type matching `dev:hub`/`dev:runner-web`, scope `target-app` since it lives in its own top-level folder used by both developers and e2e tests, not solely `test-e2e`), wrapping a small helper that auto-detects the available compose command in order (`docker compose`, `podman compose`, `podman-compose`) per C004, so the same script works on the user's Docker and Podman machines.
- Add the guard test above under `test-e2e/`.

---

### Step 2 — Finalize ADR and document usage

**Guard:** `npm run guard:tools:md-links` passes against the new/moved docs.

**References**
- [docs/adrs/tools/_index.md](../../adrs/tools/_index.md)
- [docs/context/tools/_index.md](../../context/tools/_index.md)

**Work:**
- Move `0000-use-bambooinvoice-in-docker-for-target-app.md` from this spec folder into `docs/adrs/tools/`, renumbered per that folder's convention, and set its Status to Accepted; link it from `docs/adrs/tools/_index.md`.
- Add a short `docs/context/tools` reference doc covering: how to start/stop the target app (`dev:target-app:up`/`dev:target-app:down`), the port it's reachable on, and the default seeded data/credentials; link it from `docs/context/tools/_index.md`.
- Add `dev:target-app:up` / `dev:target-app:down` to CLAUDE.md's "Build & Run" commands table.

---

## Out of scope

- Runner actually connecting to or extracting data from this target application (later Runner main-loop work).
- CI pipeline wiring for the target application container.
- Any data reset/truncate strategy beyond the one-time seed on first boot.
- TLS/HTTPS for the target application.
- Registering this application as a "Registered Application" in Hub's data.

## Traceability

- Source: [docs/todos/0002-01-pages-to-jobs.md](../../todos/0002-01-pages-to-jobs.md) item 4

## Open questions for the user

None — the application/tech choice is resolved via the draft ADR in this folder.
