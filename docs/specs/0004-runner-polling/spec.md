# Spec 0004: Runner Polling

## Goal

The runner-web process, configured with a Hub URL, its runner id, and a shared bearer secret, connects to Hub on startup, is told its poll interval and intervention timeout, then loops calling a poll endpoint (always "no work" for now) while Hub records its heartbeat — visible on the Registered Application page as "alive"/"idle" — all provable by an automated multi-service e2e test.

## Requirements

- R001: Runner reads `HUB_URL`, `RUNNER_ID`, and a shared bearer secret from a gitignored `.env` file; a committed `.env.example` documents the same keys with non-secret placeholder/seeded values.
- R002: On startup, runner calls a Hub "init" endpoint with its `RUNNER_ID` and bearer secret. Hub validates the runner exists and the bearer secret matches, records the runner's heartbeat, and responds with the poll interval (seconds) and intervention timeout (seconds) — the timeout is logged only; nothing consumes it until human intervention exists.
- R003: An invalid/unrecognized runner id or bearer secret on init is rejected by Hub and the runner logs the failure and exits (no retry loop) rather than starting to poll. There is no separate "active" flag on `runner` yet — "verify it is allowed to connect" (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#runner)) means the runner id row exists and the secret matches, nothing more.
- R004: After a successful init, runner loops calling a Hub "poll" endpoint every poll-interval seconds; each poll call is authenticated the same way as init and updates the runner's heartbeat. The poll endpoint always responds "no work available" — no job table exists yet.
- R005: Hub's runner-facing endpoints live under `src/hub/src/routes/api/runner/*`, following [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md).
- R006: A runner is considered "alive" on the Registered Application page if `last_heartbeat_on` is within the last 60 seconds, otherwise "idle"; a runner that has never connected (`last_heartbeat_on` is null) shows "idle".
- R007: A new top-level multi-service e2e test starts both hub and runner-web, overrides the poll interval to a short value for test speed, and asserts against runner-web's console output that it initializes and enters its poll loop.
- R008: A hub e2e test asserts a runner shows "idle" before any init call and "alive" after calling the init endpoint directly.

## Constraints

- C001: No job table exists yet (deferred to a later spec) — the poll endpoint has no job data to return; "claim", "instructions", and "simulated results" behavior is out of scope here.
- C002: The bearer secret is a single shared stand-in value (not per-runner), stored as an env var on both hub and runner — real runner registration/credentialing is FUTURE per [ARCHITECTURE.md](../../../ARCHITECTURE.md#application-security).
- C003: `test-e2e/` (multi-service e2e) is not yet wired up (`guard:tools:e2e` doesn't exist as an npm script) — this spec adds the Playwright project, nx target, and npm script as part of adding the first test there.
- C004: New API routes follow [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md); runner init/poll are actions on a single runner resource (`/api/runner/runners/[id]/init`, `/api/runner/runners/[id]/poll`).
- C005: Follow [Database Handling](../../context/hub/backend/database-handling.md) conventions for the heartbeat update (repository function taking `Database.Database`, `dates.ts` for the timestamp).
- C006: Runner-web has no existing env-loading mechanism — use Node 24's built-in `--env-file` flag rather than adding a dependency.

## Sequencing

Step 1's multi-service e2e guard stays red until Step 5 (runner poll loop) lands. Steps 2-4 build Hub's side (endpoints, heartbeat, UI status) before the runner loop that calls them.

---

### Step 1 — Multi-service e2e guard: runner startup and poll loop

**Guard:** new `test-e2e/runner-startup.spec.ts`; red until Step 5.

**Note (as implemented):** the config has one `webServer` entry (hub) rather than two — Playwright's `webServer` readiness check needs a port/URL to poll, and runner-web has none. The spec spawns runner-web itself (`node:child_process`) so it can capture and assert on its stdout/stderr directly. Later steps touching runner-web startup should build on this spawn-in-spec pattern rather than assuming a second `webServer` entry.

**References**
- [Hub e2e conventions](../../context/hub/e2e/conventions.md) (apply the same user-observable-assertion spirit; this is process console output, not a page)
- `src/hub/playwright.config.ts` for the pattern of a Playwright config with a `webServer`

**Work:**
- Add `test-e2e/playwright.config.ts` with two `webServer` entries (hub build+preview, runner-web via `node --env-file=<test env file> --watch src/runner-web/index.ts`), runner-web's env overriding the poll interval to a short value (e.g. 1s) and pointing `HUB_URL` at hub's e2e port.
- Add `test-e2e/runner-startup.spec.ts`: assert runner-web's stdout shows a successful init (poll interval/intervention timeout logged) followed by at least two poll-loop log lines within a few seconds.
- Add `guard:tools:e2e` npm script and an `e2e` nx target on the root `tools` project (`project.json`) running this Playwright config; wire it into the `tools:guard` target list per the "manual, before PR" convention already noted in CLAUDE.md's command table.

---

### Step 2 — Hub: runner init and poll endpoints, heartbeat repository update

**Guard:** integration test per endpoint asserting the response envelope shape and a heartbeat repository test asserting `last_heartbeat_on` is updated on init and on poll.

**References**
- [Database Handling](../../context/hub/backend/database-handling.md)
- `src/hub/src/lib/server/repositories/runnerRepository.ts`

**Work:**
- Add `updateRunnerHeartbeat(db, runnerId, when)` to `runnerRepository.ts` using `dates.ts`'s `toDbDate`.
- Add `RUNNER_SHARED_SECRET` and a hardcoded poll-interval-seconds constant + intervention-timeout-seconds constant to hub's server config/env handling (poll interval only needs to live in code for now per R004/C001 — no per-runner config yet).
- Add a shared `requireRunnerBearerAuth(request)` helper (used by both routes below) checking the `Authorization: Bearer` header against `RUNNER_SHARED_SECRET`.
- Add `src/hub/src/routes/api/runner/runners/[id]/init/+server.ts` (`POST`): checks bearer auth, validates the runner id exists, calls `updateRunnerHeartbeat`, returns `{ data: { pollIntervalSeconds, interventionTimeoutSeconds } }`; unknown runner id or bad/missing bearer returns 401/404 per conventions.
- Add `src/hub/src/routes/api/runner/runners/[id]/poll/+server.ts` (`POST`): same auth/heartbeat update, returns `{ data: { hasWork: false } }`.
- Add `HUB_DATABASE_URL`-style env docs for `RUNNER_SHARED_SECRET` to `src/hub/.env.example`.

---

### Step 3 — Hub UI: alive/idle status

**Guard:** unit test on the alive/idle pure function covering the 60-second boundary (just under/over, plus null heartbeat), and a new hub e2e test (R008) asserting the Registered Application page shows "Idle" for the seeded runner, then "Alive" after a direct `POST` to the init endpoint via Playwright's `request` fixture, without a full page reload assumption beyond a normal navigation/refresh.

**References**
- `src/hub/src/routes/registered-applications/[id]/_components/RunnersPanel.svelte`
- [Hub components conventions](../../context/hub/frontend/components.md)

**Work:**
- Add a pure function (e.g. in `runnerRepository.ts` or a small `runnerStatus.ts`) computing `"alive" | "idle"` from `lastHeartbeatOn` and "now" against the 60-second threshold (R006).
- Update `RunnersPanel.svelte` to display the computed status alongside the existing heartbeat timestamp.

---

### Step 4 — Runner-web: config loading and init call

**Guard:** unit test asserting config loading throws (per repo's "let it crash" rule) when a required env var is missing, and a unit test (mocked fetch) asserting a successful init call logs the returned interval/timeout and a failed init call logs and causes the process to exit non-zero.

**References**
- `src/runner-web/logger.ts` (existing log helper/format)
- [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md) (error envelope shape to expect back)

**Work:**
- Add `src/runner-web/config.ts` reading `HUB_URL`, `RUNNER_ID`, `RUNNER_SHARED_SECRET` from `process.env`, throwing if any are missing/unset (no defaults).
- Add `src/runner-web/.env.example` (`HUB_URL`, `RUNNER_ID` set to the seeded runner's id, `RUNNER_SHARED_SECRET` placeholder) and gitignore `src/runner-web/.env`.
- Update `dev:runner-web` npm script to pass `--env-file=src/runner-web/.env`.
- Add the init call: `POST {HUB_URL}/api/runner/runners/{RUNNER_ID}/init` with the bearer header; on success log the returned poll interval/intervention timeout; on failure (network, 401, 404) log and `process.exit(1)`.

---

### Step 5 — Runner-web: poll loop

**Guard:** Step 1's `test-e2e/runner-startup.spec.ts` passes; unit test asserting the loop calls poll on the configured interval (fake timers) and logs each poll response.

**Work:**
- After a successful init, start a `setInterval`-driven loop calling `POST {HUB_URL}/api/runner/runners/{RUNNER_ID}/poll` at the returned interval, logging each response (`hasWork`) via `logger.ts`.
- Update `index.ts` to run config load → init → poll loop in sequence.

---

### Step 6 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- Run `write-agent-context` for topic `runner-config`, area `runner-web`: the `.env`/`.env.example` keys, the `--env-file` startup flag, and what init/poll do.
- Run `write-agent-context` for topic `runner-api`, area `hub`: the `/api/runner/*` endpoint shapes and bearer auth check, cross-linked from [cross-system-contracts](../../context/cross-system-contracts/_index.md) since both hub and runner-web depend on this contract.

---

## Out of scope

- Real job claim, instructions, or simulated action results from the poll endpoint (deferred to the job-queue spec).
- Runner registration flow, per-runner credentials, IP/fingerprint-based auth (all FUTURE per [ARCHITECTURE.md](../../../ARCHITECTURE.md#application-security)).
- Configurable/per-runner poll interval (hardcoded server-side constant for now, per R004).
- The target application from todo item 4.
- Long-poll/WebSocket/SSE transport (plain HTTP polling only, per [ARCHITECTURE.md](../../../ARCHITECTURE.md#mid-term)).

## Traceability

- Source: [docs/todos/0002-01-pages-to-jobs.md](../../todos/0002-01-pages-to-jobs.md) item 3 "Runner polling"

## Open questions for the user

1. Should this spec's poll endpoint be a skeleton always returning "no work available", leaving claim/instructions/simulated results for the later job-queue spec?
   User Answer: Yes — skeleton poll only; full core loop lands with the job-queue spec.
2. What heartbeat-recency threshold marks a runner "alive" on the Registered Application page?
   User Answer: 60 seconds.
