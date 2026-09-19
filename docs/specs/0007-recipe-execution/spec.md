# Spec 0007: Recipe Execution (Real Browser Trial/Execute Loop)

## Goal

A Runner drives a real Playwright browser against the target application to run a persisted Recipe's Steps DSL for Trial and Execute Jobs, so a user can press Start Trial/Start Job in Hub and get a real Completed-Success/Completed-Failed/Intervention-Requested outcome with real extracted outputs, instead of the current scripted stand-in.

## Requirements

- R001: Runner drives a real Chromium browser (Playwright) against the target application for `recipe_job` (Trial/Execute) Jobs — no simulated delay/echo loop.
- R002: Runner executes the POC Steps DSL (`open, click, focus, fill, select, scrollIntoView, scroll, read, check, verify, assign, group, if, goto, finish, fail`) with the target/condition/reference semantics in [steps-dsl.md](../../todos/supporting-docs/steps-dsl.md).
- R003: Runner runs one shared Automatic Loop for Trial and Execute: track current Step, resolve input/output/credential references, execute, scan+run recoverable scenarios, evaluate the `finish` checkpoint plus declared outputs, report structured transcript/results, clean up browser/temp resources, return to polling.
- R004: Hub persists a Recipe (draft/published, immutable `definition` once used) per [recipe.md](../../todos/supporting-docs/recipe.md) and dispatches the full runner payload (`recipe` definition, `ingredients`, `controls`, `stepTimeoutMs`, `comms`) to replace the scripted-step stand-in for `recipe_job`.
- R005: Hub seed data includes one published Recipe that completes `Completed-Success` end-to-end against the local target application, and one that reaches `Intervention-Requested` (and, unattended, times out to `Completed-Failed`), both reachable via Start Trial/Start Job.
- R006: Start Trial and Start Job modals validate Ingredient inputs against the Recipe's declared `inputs` (type/required/nullable/enum) before dispatch, list only draft (Trial) or published (Execute) Recipes, and show which Steps are `irreversible` for review before Start Trial.
- R007: Job screen shows real transcript, structured outputs (masked/safe values, matching the existing `ResultsPanel` `safeValue` pattern), a final/diagnostic screenshot, and a working JSON export built from the same safe values — never raw sensitive values.
- R008: Runner enforces this outcome mapping at runtime, matching [ARCHITECTURE.md](../../../ARCHITECTURE.md#core-loop) exactly (no case falls through to a guess):
  - Allowlist violation, or an unexpected/technical error (invalid DSL shape slipping past R009, browser crash, etc.) → `Completed-Error`, exit immediately.
  - A Step failure with no matching recoverable scenario (includes: missing selector, ambiguous selector — multiple matches for a one-element operation, `verify` timing out) → `Intervention-Requested`.
  - `Intervention-Requested` left unattended past the Hub-provided timeout → `Completed-Failed` (see R011).
  - `fail` action → `Completed-Failed` with its code/message, exit immediately.
- R009: A Recipe is rejected before dispatch if invalid: duplicate Step ids, unknown references/jump targets, invalid enum/action values, or nesting deeper than the DSL's fixed one-level group/if depth. This is a validation error at Recipe-save/dispatch time, not a Job outcome.
- R010: `finish` requires its own checkpoint condition to evaluate true; assigned output fields alone never establish completion.
- R011: On `Intervention-Requested`, the Runner keeps the same browser session open and waits up to the Hub-provided intervention timeout, then reports `Completed-Failed` and exits if unrecovered.
- R012: The Runner captures a screenshot at each reported Step and on terminal exit, masks any Ingredient/credential values it can locate on the page before sending it, and Hub stores/serves it as a Job artifact for the Job screen (R007). This is the same baseline credential masking already described for Training in [ARCHITECTURE.md](../../../ARCHITECTURE.md#core-loop); third-party PII detection is a separate, later layer (C006).
- R013: Transcript rows for `read`/`assign` Steps record the output field name and outcome only — never the raw extracted value — mirroring the existing `raw_value`/`safe_value` split so a sensitive value is never exposed outside `job_result`'s masked-read path.

## Constraints

- C001: DSL scope is exactly the POC vocabulary in steps-dsl.md; the extended vocabulary (steps-dsl-extended.md) is not implemented here.
- C002: No LLM involvement — Trial/Execute Steps come solely from the persisted Recipe definition ([ARCHITECTURE.md](../../../ARCHITECTURE.md#execute-mode): "No LLM usage in this mode").
- C003: Training Mode's own Runner loop (`training_job`) is untouched — Training/LLM recipe authoring is a separate todo (`0004-01-training.md`); Recipes here are hand-authored seed data.
- C004: Credential values resolve only on the Runner (local config), are never sent to Hub, and stay masked in any diagnostics.
- C005: The interactive "Take Control" panel for `Interactive-User` is out of scope (todo explicitly defers it to M6); this spec only needs to reach and time out of `Intervention-Requested`.
- C006: Third-party sensitive-data detection for screenshot masking (the general-purpose PII library) is out of scope (todo item 2, separate spec) — R012's credential-only masking is the baseline that ships now, matching the degraded-masking allowance ARCHITECTURE.md already describes for Training's synthetic-data mode.
- C007: An ADR is needed for adding a production Playwright driving dependency to `runner-web` (distinct from the existing `@playwright/test` used only for Hub e2e).
- C008: `job-queue.md`'s "Hub alone decides progression/success/failure; a Runner must never count steps or decide an outcome itself" note describes the Training scripted-step stand-in only. This spec makes the Runner authoritative over DSL Step progression *within* a Hub-persisted, Hub-validated Recipe (R009) for `recipe_job` — the doc update in Step 7 must state this scope split explicitly so it doesn't read as a violated guardrail.
- C009: Recipes in this spec are hand-authored seed data (C003), so the Hub-side pixel-to-document coordinate mapping steps-dsl.md describes for `by:point` targets (needed for a future Training-authoring UI) is not required; the Runner still implements `point` resolution per R002 for completeness.

## Sequencing

Step 1's e2e Job scenarios describe user-observable behavior that doesn't exist yet; they stay red until Step 6 (Hub UI) lands. Steps 2–5 build bottom-up (Recipe storage → dispatch payload → DSL interpreter → Automatic Loop) because the loop can't be tested end-to-end without a payload to execute against.

---

### Step 1 — E2E guards for real Trial/Execute outcomes

**Guard:** New `test-e2e/` spec(s) that boot hub + runner-web + target-app, seed the two Recipes from R005, and assert: (a) Start Job on the happy-path Recipe reaches `Completed-Success` with the expected real outputs; (b) Start Job on the failing Recipe reaches `Intervention-Requested` and then `Completed-Failed` after the intervention timeout. Stays red through Step 6.

**References**
- [test-e2e/target-app.spec.ts](../../../test-e2e/target-app.spec.ts) — pattern for booting target-app in an e2e test
- [docs/context/tools/target-app.md](../../context/tools/target-app.md) — seeded login/data this Recipe will use

**Work:**
- Add the e2e spec(s) under `test-e2e/`; they will fail until later steps land.

---

### Step 2 — Hub: Recipe entity and immutable definition storage

**Guard:** Repository/unit tests: create draft, publish (draft→published transition only), fetch by id/version, definition is immutable once referenced by any Job.

**References**
- [recipe.md](../../todos/supporting-docs/recipe.md) — Hub record vs runner payload split, lifecycle rules
- [job-queue.md](../../context/hub/job-queue.md) and its migration `20260916113338_restructure_job_tables.sql` — `recipe_job.recipe_id` already points at a `recipe` table that doesn't exist yet (dead scaffolding to fill in)
- [Database Handling](../../context/hub/backend/database-handling.md), [Repository Return Value Conventions](../../context/hub/backend/repository-return-value-conventions.md)

**Work:**
- dbmate migration creating `recipe` (id, customer/application scope, name, goal, state, created_at, published_at, source_training_run_id nullable, definition json per steps-dsl.md/recipe.md shapes).
- `recipeRepository.ts`: create draft, publish, fetch. TS types for `RecipeDefinition` (`schemaVersion, inputs, outputs, steps, recoveries`) matching [examples.json](../../todos/supporting-docs/examples.json).
- Validate a definition against R009/R010 at creation time; reject invalid ones.

---

### Step 3 — Hub: seed Recipes and real runner dispatch payload

**Guard:** Integration test: polling/claiming a `recipe_job` returns the full runner payload contract (`jobId, mode, recipeId, recipeVersion, recipe, ingredients, controls, stepTimeoutMs, comms`) built from the stored Recipe, not `SCRIPTED_TRAINING_STEPS`. Steps-report endpoint accepts DSL-shaped reports (`stepId, outcome, parentStepId?, extractions?`), persists transcript rows with field name/outcome only (R013) and result rows through the existing masked-upsert path, and rejects/accepts a screenshot artifact per Step (R012).

**References**
- [runner-api.md](../../context/hub/backend/runner-api.md), `runnerActions.ts`, `scriptedTrainingSteps.ts` (stand-in being replaced for `recipe_job` only — `training_job` keeps it, see C003)
- [seed.ts](../../../src/hub/src/lib/server/storage/db/seed.ts) — current minimal Customer/Application/Runner seed to extend

**Work:**
- Seed two Recipes (draft+published each, per R005) against the local target application: a happy path (log in, open the seeded invoice, read invoice/client/amount fields, finish) and a failing one (a Step whose target cannot resolve and has no matching recovery, per R008).
- Replace the `recipe_job` branch of poll/claim and steps handling to build/consume the real payload instead of scripted steps.
- Add a screenshot-artifact table/column and comms endpoint for the Runner to upload per-Step/terminal screenshots (R012); reads route through the same masked-serving convention as `job_result`.
- Ensure transcript persistence for `read`/`assign` outcomes never accepts/stores a raw value field (R013) — only the destination name and outcome.

---

### Step 4 — Runner-web: Playwright driver and DSL action/condition executors

**Guard:** Unit tests per action/condition (`open, click, focus, fill, select, scrollIntoView, scroll, read, check, verify, assign, goto, finish, fail`; conditions `exists, visible, enabled, disabled, assigned, all, any`) against a local fixture page, plus target resolution by `text/label/placeholder/css/point`.

**References**
- [steps-dsl.md](../../todos/supporting-docs/steps-dsl.md) — full target/action/condition table and Playwright mapping
- [Runner Config & Startup](../../context/runner-web/runner-config.md) — where credential env config belongs

**Work:**
- Add a production Playwright dependency to `runner-web` (see C007) and a browser/context/page lifecycle scoped to one Job.
- Target resolver (text/label/placeholder/css exact-match; point mapped from full-page screenshot coordinates to document coordinates, per steps-dsl.md).
- Value/reference resolver: `input`/`output` from the Job payload's ingredients/collected-outputs map, `credential` from Runner-local env config (new `RUNNER_CREDENTIAL_<name>`-style vars, following the existing `requireEnv` "let it crash" pattern).
- DSL interpreter module implementing each action/condition; ambiguous matches (multiple hits for a one-element op) and missing matches are distinct, reported failures (R008), never a silent first-match pick.

---

### Step 5 — Runner-web: shared Automatic Loop, recovery, intervention, cleanup

**Guard:** `pollLoop` tests covering: happy-path success with a masked screenshot uploaded per Step; a recoverable scenario applied mid-run then continuing; an unrecoverable/ambiguous-selector failure going to `Intervention-Requested` then timing out to `Completed-Failed`; an allowlist violation and an unexpected technical error both going to `Completed-Error` per R008's mapping.

**References**
- [ARCHITECTURE.md](../../../ARCHITECTURE.md#core-loop) — Automatic Loop / Interactive Loop state transitions
- [pollLoop.ts](../../../src/runner-web/pollLoop.ts) — current simulated `runJobLoop` being replaced
- [Runner HTTP Handling](../../context/runner-web/runner-http-handling.md)

**Work:**
- Replace `runJobLoop`'s sleep/echo with the real interpreter loop: track current Step id (including group/if child continuation per steps-dsl.md's resume rule), run the recoverable-scenario scan after each Step, evaluate `finish`'s checkpoint (R010), enforce `stepTimeoutMs` per Step and a bounded number of recovery attempts before giving up.
- Implement R008's outcome mapping exactly: allowlist violation and unexpected/technical errors exit immediately as `Completed-Error`; a Step failure with no successful recovery (including missing/ambiguous selector and `verify` timeout) switches to `Intervention-Requested` instead of erroring out; `fail` exits as `Completed-Failed`.
- Capture and credential-mask a screenshot per reported Step and on terminal exit, uploading via the Step 3 artifact endpoint (R012).
- `Intervention-Requested`: keep the browser/page open, poll Hub for a human Step vs. the Hub-provided intervention timeout; timeout reports `Completed-Failed` (R011). No "Take Control" UI (C005) — this only needs the Runner-side wait/timeout behavior.
- Clean up browser/context/temp resources on every terminal exit path, then return to polling.

---

### Step 6 — Hub UI: Start Trial/Start Job modals, Job screen, export

**Guard:** Component/e2e test: modal rejects a submission missing a required Ingredient or violating an enum/type; Start Trial modal lists Steps with an irreversible badge; Job screen for a completed Job shows real safe/masked outputs and screenshot; export produces a JSON file built from the same safe values, matching the Job's result envelope.

**References**
- [Modals](../../context/hub/frontend/modals.md), [Local Svelte Component Conventions](../../context/hub/frontend/components.md)
- `src/hub/src/routes/registered-applications/[id]/_components/StartTrainingModal.svelte` — existing modal pattern to follow for the new Start Trial/Start Job modals
- `src/hub/src/routes/jobs/[id]/+page.svelte` and its `ResultsPanel`/`TranscriptPanel` components — wire to real Recipe outputs/transcript instead of scripted values

**Work:**
- Start Trial modal (draft Recipes) and Start Job modal (published Recipes): Ingredient input form validated against the Recipe's declared `inputs`; Step list with irreversible badges for review.
- Job screen: real safe/masked outputs, transcript, final/diagnostic screenshot (served through the Step 3 artifact endpoint); add a JSON export action (result envelope: masked `outputs` + `runnerTimezone`, per recipe.md — R007).

---

### Step 7 — ADRs, defers, and context docs

**Guard:** n/a (docs step).

**Work:**
- `write-adr` for the `runner-web` Playwright browser-driving dependency choice (C007).
- `write-adr` or `write-agent-context` update recording the Recipe/DSL execution model on the Runner, superseding the "scripted-step stand-in is server-authoritative" note in [job-queue.md](../../context/hub/job-queue.md) (C008), and updating [runner-api.md](../../context/hub/backend/runner-api.md) for the new payload/report shapes.
- `write-defer` for any ARCHITECTURE.md `(FUTURE)` item this spec's design touches but intentionally doesn't build (e.g. Human Intervention → Improved Recipe, recovery `maxUses`/retry policy, backward goto/loop budgets — all already flagged FUTURE/deferred in steps-dsl-extended.md, confirm nothing new needs a fresh defer entry).

---

## Out of scope

- Training Mode's own Runner loop and LLM-driven Recipe compilation (`0004-01-training.md`).
- The interactive "Take Control" human-intervention control panel (M6, per todo).
- Third-party sensitive-data/PII screenshot masking (todo item 2, separate spec).
- Extended DSL vocabulary (roles, xpath, frames, hover/type/press, nested groups, etc. — steps-dsl-extended.md).
- Runner registration, multi-tenant RBAC, retries/stale-job handling, and other items already marked (FUTURE) in ARCHITECTURE.md.

## Traceability

- Source: [docs/todos/0003-01-real-browser-operation.md](../../todos/0003-01-real-browser-operation.md) item 1
