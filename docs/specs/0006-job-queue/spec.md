# Spec 0006: Runner Main Loop and Hub Job Queue

## Goal

A user starts a Training Run from the Start Training modal; Hub creates a real `Pending` Job; a matching Runner claims it, works through a small hardcoded/scripted sequence of steps (no real browser, no LLM), reports each step to Hub as Transcript entries, and reaches a terminal status — all visible on the Job screen without a manual refresh assumption beyond normal navigation. A user can cancel a Job and the assigned Runner exits it and returns to polling. A Runner not registered to the Job's Customer x Application can neither claim nor access it.

## Requirements

- R001: Hub persists Jobs (`job` table): customer_application_xref_id, mode (plain text, e.g. `"training"` — only value written this spec; no lookup table, since only `job_status` has more than one meaningful consumer per C004), status, goal, starting_url, allowlist, max_steps, runner_id (nullable until claimed), created_at, started_at, heartbeat_on, completed_at.
- R002: A `job_status` lookup table (seeded system data, mirrored by a TS enum, same pattern as `recipe_status`/`RecipeStatus`) provides: Pending, Running, Completed-Success, Completed-Failed, Completed-Cancelled.
- R003: StartTrainingModal submits goal, starting URL, and max steps to Hub, which creates a `Pending` Job scoped to the Registered Application the modal was opened from. Allowlist is derived server-side as the starting URL's origin (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#core-loop): "starting URL, which is also used to seed the allowlist") — no new modal field.
- R004: On poll, Hub atomically finds the oldest `Pending` Job whose `customer_application_xref_id` matches the polling Runner, assigns `runner_id`/`started_at`/`heartbeat_on`, sets status `Running`, and returns it to the Runner; a Runner registered to a different Customer x Application never sees it. (`heartbeat_on` exists per [ARCHITECTURE.md](../../../ARCHITECTURE.md#job-coordination)'s Job Ownership section but has no consumer yet — `Completed-Stale` detection is out of scope, C003.)
- R005: Runner reports each step's outcome and, in the same call, receives the next scripted step or a terminal status (`{ finished: true }` → `Completed-Success`, or the R007 max-steps case → `Completed-Failed`) via a single Job-scoped, Runner-scoped endpoint — there is no separate "complete" call; Hub decides and persists the terminal status synchronously within this same request, matching [ARCHITECTURE.md](../../../ARCHITECTURE.md#core-loop)'s single report-and-ask-for-next-step loop. Every call (terminal or not) also updates `job.heartbeat_on` and the Runner's own `last_heartbeat_on`, so RunnersPanel (R011) stays accurate for a Runner that's mid-job and not calling poll. Hub records each report as an append-only Transcript entry (`job_transcript_entry`: job_id, sequence, kind, text, created_at) keyed uniquely by `(job_id, sequence)` so a repeated/late report is a no-op, not a duplicate.
- R006: The scripted step sequence and its extracted value(s) are a small hardcoded array in Hub code, clearly labeled as scripted/fake-model (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#modes-training-trial-execute)) — no LLM call, no Playwright automation. Extracted values are recorded to a `job_result` table (job_id, field_name, value, created_at), one row per field, latest write wins.
- R007: If the scripted sequence reaches the Job's `max_steps` before signaling "finished", Hub sets status `Completed-Failed` (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#training-mode) step 2.2.i); if "finished" is reached within budget, Hub sets status `Completed-Success`. Hub alone makes this determination (server-authoritative) — the Runner never counts steps itself.
- R008: Every Job-scoped Runner endpoint call is rejected (403) unless the calling Runner id (from the existing bearer-authenticated `[id]` path segment) matches the Job's assigned `runner_id`; an already-terminal Job's status is returned as-is without mutating it, and the Runner exits its loop back to polling on seeing a terminal status (no revival).
- R009: A Hub user can cancel a `Pending` or `Running` Job (button on the Job screen); Hub sets status `Completed-Cancelled`. The assigned Runner (if any) observes the terminal status on its next report/step call per R008 and returns to polling.
- R010: Jobs list page and Job detail page (`JobStrip`, `StageSummary`, `TranscriptPanel`, `ResultsPanel`, `GoalsPanel`) read from real Hub APIs instead of `mockJobs.ts`; `mockJobs.ts` and its hardcoded fixtures are removed.
- R011: RunnersPanel shows a Runner's current Job (linked) when `Running`, otherwise Idle/Alive per existing heartbeat status, per [ARCHITECTURE.md](../../../ARCHITECTURE.md#user-interface) "current activity (running job X, idle)".
- R012: The Job screen and Jobs list display a computed string id, `job-ca{customerApplicationXrefId}-{id}`, matching the mockup's string-id style (`mockJobs.ts`'s `job_8f41c9`); this is a display label only — routes/APIs still use the plain integer `job.id` (C005/DEFER 1 is unaffected).
- R013: A shared `RefreshIndicator` component (`src/hub/src/lib/components/`) shows a de-emphasized "Last refreshed {time}" label plus a bottom-border bar that shrinks from full to empty over a given interval prop; on reaching empty it invokes a caller-supplied refresh callback and restarts once the caller passes back an updated last-refreshed time. It is used on the Job detail page and the Registered Application page's RunnersPanel to drive their periodic API refetches — neither page does a full browser reload, and this component replaces any bespoke per-page interval. Suggested starting intervals (caller-supplied, not hardcoded in the component): Job detail page 5s (transcript/status should feel live), RunnersPanel 15s (heartbeat threshold is 60s, so this is frequent enough to see Alive/Idle flips without excessive polling).

## Constraints

- C001: No Recipe compilation on Job completion — Recipes remain unavailable this spec, per the todo item's standing exception; Training success does not produce a draft Recipe yet.
- C002: No real browser automation, no LLM call, no DSL/schema-version payload — the scripted-step mechanism replaces all of that for this spec only, and is Training-mode only.
- C003: No `Intervention-Requested`/`Interactive-User`/`Completed-Error` statuses — unreachable without real errors or human intervention, both out of scope (no human intervention overlay yet). `Completed-Stale` is also out of scope, for a separate reason: no staleness monitor exists to notice a Runner has gone quiet (`heartbeat_on` is recorded per R004/R005 but nothing reads it yet).
- C004: Trial/Execute modes and their "Start Trial"/"Start Job" buttons remain pre-canned/fake per the todo item; this spec does not touch them.
- C005: New API routes follow [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md) and reuse the existing bearer-auth + `[id]` runner-lookup pattern from `runnerActions.ts`. Job/Runner ids stay plain sequential integers (guessable) — see [DEFER 1](../../defers/0001-opaque-public-resource-ids.md).
- C006: Follow [Database Handling](../../context/hub/backend/database-handling.md): repository functions take `Database.Database`, dates go through `dates.ts`, migration adds tables (no hand-edited `schema.sql`), `resetUserData()` gains the new user-data tables.
- C007: Job claim-on-poll must be a single atomic DB operation (transaction), matching the "atomic operation" wording in [ARCHITECTURE.md](../../../ARCHITECTURE.md#job-coordination).
- C008: This spec introduces the first 403 and 409 responses in the codebase (alongside the existing 200/201/401/404 from spec 0004) — [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md) gains a status-code table (Step 6) so future endpoints follow one standard rather than each author picking codes ad hoc.

## Sequencing

Step 1's multi-service e2e guard stays red until Step 5 (Runner loop) lands. Steps 2-4 build Hub's side (schema, APIs, UI) before the Runner loop that drives them.

---

### Step 1 — Multi-service e2e guard: full Job lifecycle

**Guard:** new `test-e2e/job-lifecycle.spec.ts`; red until Step 5.

**References**
- `test-e2e/runner-startup.spec.ts` and `test-e2e/playwright.config.ts` (spec 0004's spawn-in-spec pattern for runner-web)
- [Hub e2e conventions](../../context/hub/e2e/conventions.md)

**Work:**
- Seed (or create via API) a second Runner on a different Customer x Application in the e2e database.
- Drive a Training Job end-to-end: call Hub's create-job API (or the modal) for the seeded Registered Application, assert the Job is `Pending`, start runner-web against it, assert it claims the Job (`Running`), assert transcript entries accumulate on the Job screen, assert terminal status (`Completed-Success`) is reached and runner-web's console output shows it returning to polling.
- Assert the second Runner's poll never returns this Job (still empty-work; a direct `steps` call by that Runner against the Job id gets a 403 per R008).
- Create a second Job, cancel it via Hub's cancel API/UI while a Runner is assigned, assert the Runner's next call reports the terminal `Completed-Cancelled` status and the console shows it resuming polling.

---

### Step 2 — DB schema and repositories: job, job_status, transcript, results

**Guard:** repository integration tests: claim atomicity — two Runners on the *same* xref both call `claimNextJobForRunner` for one `Pending` Job, exactly one succeeds and the other gets nothing; xref isolation — a Runner on a *different* xref never sees the Job; idempotent transcript insert on duplicate sequence; result upsert; terminal-status no-op update.

**References**
- [Database Handling](../../context/hub/backend/database-handling.md)
- `src/hub/src/lib/server/db/recipeStatus.ts` (pattern to mirror for `job_status`)
- `src/hub/src/lib/server/repositories/runnerRepository.ts` (repository shape to follow)

**Work:**
- New migration: `job_status` (seeded: 1=Pending, 2=Running, 3=Completed-Success, 4=Completed-Failed, 5=Completed-Cancelled), `job`, `job_transcript_entry` (`UNIQUE(job_id, sequence)`), `job_result` (`UNIQUE(job_id, field_name)`).
- `src/hub/src/lib/server/db/jobStatus.ts`: `JobStatus` TS enum mirroring the seeded ids.
- `src/hub/src/lib/server/repositories/jobRepository.ts`: `insertJob`, `getJobById`, `listJobs`, `claimNextJobForRunner(db, runnerXrefId, runnerId, now)` (atomic transaction, sets `runner_id`/`started_at`/`heartbeat_on`), `updateJobStatus` (no-op if already terminal), `updateJobHeartbeat`, `appendTranscriptEntry` (ignore on duplicate sequence), `upsertJobResult`, `listTranscriptEntries`, `listJobResults`.
- Add `job_result`, `job_transcript_entry`, `job` to `resetUserData()`'s table list (delete order respects FKs); leave `job_status` untouched (system data).

---

### Step 3 — Hub APIs: job creation, list/detail, cancel, and Runner-facing claim/steps

**Guard:** integration test per endpoint/action: create validates required fields and derives allowlist; claim-on-poll only returns matching-xref Pending jobs; the step endpoint rejects mismatched runner_id (403), no-ops on an already-terminal job, and sets the terminal status itself on `finished`/max-steps; cancel transitions Pending/Running only.

**References**
- [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md)
- `src/hub/src/lib/server/runnerActions.ts` and `src/hub/src/routes/api/runner/runners/[id]/poll/+server.ts` (existing bearer-auth pattern to extend)
- [Runner API: init & poll](../../context/hub/backend/runner-api.md)

**Work:**
- `src/hub/src/routes/api/hub/registered-applications/[id]/jobs/+server.ts` (`POST`): create a `Pending` Training Job for this Registered Application; body is `{ goal, startingUrl, maxSteps }`; derives `allowlist` from `startingUrl`'s origin.
- `src/hub/src/routes/api/hub/jobs/+server.ts` (`GET`): list Jobs for the Jobs list page.
- `src/hub/src/routes/api/hub/jobs/[id]/+server.ts` (`GET`): full Job detail including transcript entries and results, replacing `mockJobs.ts`'s shape.
- `src/hub/src/routes/api/hub/jobs/[id]/cancel/+server.ts` (`POST`): `Completed-Cancelled` if currently `Pending`/`Running`, else 409.
- Extend `runnerPoll` (`runnerActions.ts`) to call `claimNextJobForRunner` and include `{ hasWork: true, job: {...} }` / `{ hasWork: false }` in the response.
- `src/hub/src/routes/api/runner/runners/[id]/jobs/[jobId]/steps/+server.ts` (`POST`): bearer auth + runner-id-matches-job-id-matches-ownership check; updates `job.heartbeat_on` and the Runner's `last_heartbeat_on`; records the reported step (or no-ops if terminal/duplicate sequence); if already terminal, returns the current status without further mutation (no revival). Otherwise: applies the R007 max-steps check (sets `Completed-Failed` + `completed_at`, returns that status) or, if the scripted array is exhausted with a "finished" marker, sets `Completed-Success` + `completed_at` and returns that status; otherwise returns the next hardcoded scripted step. This one endpoint is the whole report/next-step/terminal loop — there is no separate "complete" call.
- Hardcoded scripted-step array (goal/value-agnostic — e.g. 2-3 canned `{ text, resultField?, resultValue? }` entries) lives alongside `jobRepository.ts` or `runnerActions.ts`, clearly commented as the dev-only stand-in for LLM-directed steps.

---

### Step 4 — Hub UI: real Jobs list/detail, modal wiring, Runner activity, cancel button

**Guard:** hub e2e test asserting a Job created via the modal shows `Pending` then (after a direct API call simulating a Runner claim, same pattern as spec 0004 Step 3) `Running` with a transcript row, without a full-reload assumption beyond navigation — driven by `RefreshIndicator`'s refetch, not a manual reload; updated `StartTrainingModal.test.ts` for the real submit call and its error path; unit test for `RefreshIndicator` (fake timers) covering the countdown-to-callback and restart-on-updated-prop behavior.

**References**
- `src/hub/src/routes/registered-applications/[id]/_components/StartTrainingModal.svelte`
- `src/hub/src/routes/jobs/[id]/_components/jobTypes.ts` (shape to keep matching from the API)
- `src/hub/src/lib/components/sharedComponentProps.ts`, `DateSpan` (existing shared component to reuse for the "Last refreshed" timestamp)
- [Modals](../../context/hub/frontend/modals.md), [API Calling Pattern](../../context/hub/frontend/api-calling-pattern.md), [Local Svelte Component Conventions](../../context/hub/frontend/components.md)

**Work:**
- `src/hub/src/lib/components/RefreshIndicator.svelte` (+ `refreshIndicatorTypes.ts` per the shared-component prop pattern): implements R013.
- `StartTrainingModal.svelte`: replace the no-op comment with a real POST via a new `$lib/api/jobsApi.ts`; on success close the modal and navigate to the new Job's detail page; surface a server error inline.
- `src/hub/src/routes/jobs/+page.svelte`: list real Jobs (`job-ca{xrefId}-{id}` per R012, status, mode, customer/application, started/created time) instead of "No jobs yet."; each row links to its Job detail page.
- `src/hub/src/routes/jobs/[id]/+page.svelte` and its `_components`: fetch from `GET /api/hub/jobs/[id]` instead of `mockJobs`; delete `mockJobs.ts`. Display the R012 string id in `.job-page-id` (unchanged markup, now computed). Add `RefreshIndicator` to `.job-page-header`, leading the existing action buttons, refetching the Job on each tick so Pending → Running → terminal and transcript growth are visible without a manual page reload.
- Add a "Cancel" button (visible while `Pending`/`Running`) calling the cancel API.
- `RunnersPanel.svelte`: show "Running Job {id}" (linked, R012 string id) when a Runner's current Job is `Running`, else the existing Alive/Idle label; add `RefreshIndicator` to the panel header, refetching the Registered Application (runners) on each tick.

---

### Step 5 — Runner-web: job-aware main loop

**Guard:** Step 1's `test-e2e/job-lifecycle.spec.ts` passes; unit tests (mocked fetch) for the steps-loop request/response handling and terminal-status exit.

**References**
- `src/runner-web/pollLoop.ts`, `src/runner-web/runnerClient.ts`, `src/runner-web/logger.ts`

**Work:**
- Extend `runnerClient.ts` with a `reportStep` call to the Step 3 `steps` endpoint.
- On a poll response with `hasWork: true`, `pollLoop.ts` pauses the interval, runs the claimed Job's loop: log the scripted "action" for each step performatively, call `reportStep`, and repeat with whatever the response contains (next scripted step) until the response itself reports a terminal status — the Runner never counts steps or decides success/failure locally (R007); it just keeps calling `reportStep` and reacting to what Hub returns.
- Exit the Job loop immediately (no further step calls) the moment a response reports a terminal status, per R008/R009, then resume the poll interval.
- On a 403/404 from `reportStep` (job ownership mismatch or unknown job — shouldn't happen given R004/R008, but not impossible under a race): log it and abandon the Job loop back to polling, same as a terminal status; do not `process.exit` — unlike a bad bearer secret at init (spec 0004), this doesn't mean the Runner's own config is broken, so there may still be legitimate work to poll for.

---

### Step 6 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- `write-agent-context` for topic `job-queue`, area `hub`: the `job`/`job_status`/`job_transcript_entry`/`job_result` schema, claim atomicity, ownership checks, the scripted-step stand-in and where it lives.
- Update [Runner API: init & poll](../../context/hub/backend/runner-api.md) (rename/extend as needed) and the [cross-system-contracts index](../../context/cross-system-contracts/_index.md) for the new claim-via-poll and `steps` endpoint shapes shared with runner-web.
- Update [Runner Config & Startup](../../context/runner-web/runner-config.md) for the job-aware loop.
- Extend [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md) with a status-code table per C008: 200/201 success, 400 validation, 401 bad/missing bearer, 403 authenticated-but-not-the-owner, 404 unknown resource, 409 invalid state transition (e.g. cancelling a terminal Job).
- `write-agent-context` for topic `runner-http-handling`, area `runner-web`: how runner-web reacts to each status code from Hub (401 at init → exit non-zero, per spec 0004; 401/404 mid-poll-loop → log and continue polling, per existing `pollLoop.ts` behavior; 403/404 from `reportStep` → abandon the Job loop back to polling per this spec's Step 5; terminal Job status in a 200 body → abandon the Job loop back to polling). Cross-link it from the [cross-system-contracts index](../../context/cross-system-contracts/_index.md).
- `write-defer` for the shared single `RUNNER_SHARED_SECRET` bearer-token auth (introduced in spec 0004, formalized here as still the only auth mechanism): what real per-runner credentialing/registration would replace it and why it's deferred (ties to [ARCHITECTURE.md](../../../ARCHITECTURE.md#application-security)'s FUTURE Runner Registration item).

---

## Out of scope

- Recipe compilation from a successful Training Job (C001).
- Real browser automation, LLM-directed steps, DSL/schema-version payload, screenshots, masking (C002).
- Human Intervention, `Completed-Error`, `Completed-Stale` (C003).
- Trial/Execute mode, "Start Trial"/"Start Job" buttons (C004).
- Runner registration flow, per-runner credentials (unchanged from spec 0004).
- Job retries, paging/filtering/search on the Jobs list.
- Opaque/unguessable public resource ids ([DEFER 1](../../defers/0001-opaque-public-resource-ids.md)).

## Traceability

- Source: [docs/todos/0002-01-pages-to-jobs.md](../../todos/0002-01-pages-to-jobs.md) item 5 "Runner main loop and hub job queue"

## Open questions for the user

1. Item 5 says (mid-list) "Start Training modal creates a real Pending job..." but then lists as a remaining exception "The Start Training modal is available but can't start a job yet." Which is correct for this spec?
   User Answer: Modal creates real jobs — the "exception" bullet is a stale leftover from item 2's description.
