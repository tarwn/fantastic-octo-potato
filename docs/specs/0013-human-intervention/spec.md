# Spec 0012: Live Human Intervention

## Goal

One operator can take control of a blocked Recipe Job (Trial or Execute), drive the Runner's still-open browser session from the Hub, and either hand control back at a valid Recipe position or end the Job. Every action and outcome is visible in the Transcript, and no path leaves a Job, owner, or Runner stuck.

## Requirements

- R001: New non-terminal status `Interactive-User`. Take Control is one conditional update (`Intervention-Requested` and no owner → `Interactive-User` + owner); the loser of a race gets a 409 and no side effects. Takeover is a Transcript entry.
- R002: Only the owner may submit commands, hand back, or end the Job. Every submit re-checks status and owner in the same transaction as the write; a cancelled or otherwise terminal Job is never revived, and commands pending when the status leaves `Interactive-User` are voided, never executed.
- R003: Three command kinds, validated by the Hub before they are persisted for the Runner: `click` at image-pixel x,y (DSL `point` selector), `prompt` (Hub converts to one atomic DSL Step via the LLM), `assign` (`name=value`, checked against the Recipe's output declarations and types). Invalid input is returned to the overlay and creates no command.
- R004: One pending command per Job at a time (a submit while one is pending or unreported gets a 409; the overlay blocks until the result returns). Each submission carries a client `commandKey`; a duplicate returns the original command. The Runner executes the pending command, then reports its result with a masked screenshot. If the Job leaves `Interactive-User` while a command is executing, the Runner finishes the action, discards the result, and exits per its new status.
- R005: The overlay (opened from the Job view) shows: latest safe screenshot, blocked step and reason, recent Transcript, desired resume point (defaults to the blocked step), current owner and status. Status/owner changes close it (R013). A non-owner viewer sees a read-only overlay.
- R006: Hand back names a resume position (any Step id in the Recipe, validated by the Hub). The Runner resumes the Automatic Loop there and reports `Running`, which clears the owner. If the resume Step fails with no matching recovery, the Runner reports `Intervention-Requested` again (new blocked step/reason, owner cleared, wait restarts). "Application ready" is proven by the resume Step running, not a separate check.
- R007: Owner can end the Job as `Completed-Failed` (Hub writes the terminal status; the Runner sees it on its next poll and cleans up).
- R008: Timeouts: before takeover the existing `interventionTimeoutSeconds` wait applies; after takeover the same duration applies as an *idle* timeout, reset by each command. Expiry reports `Completed-Failed` with the reason. Every exit (timeout, hand-back failure, terminal status seen, cancellation, technical error, allowlist violation) closes the browser session and returns the Runner to polling; the Hub clears ownership on any terminal status.
- R009: Cancelling a Recipe Job is allowed while it is `Intervention-Requested` or `Interactive-User` (today only Training is cancellable); the Runner treats it as terminal.
- R010: Intervention links plus status/owner appear on the Customer, Registered Application, Jobs listing, and Job views for Jobs in either intervention status.
- R011: Operator-typed values (`prompt` text, `assign` values) are stored only in `raw*` command columns, read solely by the Runner endpoint and the masking layer, and never returned by Job/Job-list endpoints; the Transcript and responses carry the masked form (existing rules: `sensitive` outputs, credentials). The Runner-reported blocked-step reason is masked before persisting. An `assign` to a sensitive output reaches Results through the existing sensitive-output path. The overlay only ever shows the Runner-masked screenshots the Hub stores.
- R012: Each executed command is reported in the Transcript like other Steps (Step id, target description, extraction field names), so a future revision feature has the data ([defer 3](../../defers/0003-intervention-to-revised-recipe.md)).

- R013: After a command is submitted, the overlay shows a loading indicator over the screenshot and blocks further input until the command's Transcript item arrives. A Step result waits for its screenshot, then swaps to it and clears the indicator. A status change away from `Interactive-User` (terminal, error, timeout, cancel, resume accepted) auto-closes the overlay and the Job view shows the new status; a lost-ownership change closes it too, with a message naming the new owner or status.

- R014: The Job view (and its overlay) refresh on a fast interval while the Job is non-terminal and on the existing slower interval (`REFRESH_INTERVAL_SECONDS`, 5s, in `routes/jobs/[id]/+page.svelte`) once it is terminal or its latest Transcript entry is more than 6 hours old, so commands and status changes surface with minimal delay. The interval is re-chosen after every refresh, so a status change switches the rate without a reload.

## Constraints

- C001: Recipe Jobs only. Training Jobs keep their Hub-authoritative model and never enter intervention. Decided with the requester.
- C002: Trial and Execute make no model decisions on their own. The only LLM call in this feature is the Hub-side `prompt` conversion, made on an explicit operator submit, following [LLM call with validation retry](../../context/hub/backend/llm-call-validation-retry.md) with the operator's prompt, the Runner-masked latest screenshot, the masked Transcript, and the Recipe's declared outputs as its only inputs (the operator's free text is not maskable; sensitive-data classification for LLM calls stays FUTURE per ARCHITECTURE); its result must pass `validateAtomicStep`. The Runner never calls an LLM.
- C003: No auth exists. Owner identity is a client-generated `operatorId` (persisted in browser storage) sent with each intervention request; it is an ownership token that prevents mixed signals, not a security boundary.
- C004: Commands execute through the existing `executeAction`/allowlist/masking/artifact path; no new browser session, action vocabulary, or bypass of allowlist and policy checks. A blocked origin from an operator action is a `Completed-Error` like any other.
- C005: Ownership, command validity, and resume-position validity are Hub decisions; DSL Step progression after resume stays Runner-authoritative ([Job Queue](../../context/hub/job-queue.md)).
- C006: The Runner pulls by polling Hub (no push channel); commands reach it at its existing in-Job poll cadence (`RECOVERY_POLL_INTERVAL_MS`).
- C007: Draft ADR for the command wire protocol (Hub-persisted single pending command, Runner pull, idempotency keys), written in Step 3 when the protocol first exists, moved to `docs/adrs/hub/` in the last step.

## Sequencing

Vertical slices, UI first, each one runnable end to end through the real Hub UI, Hub, and Runner in the same browser session, with its own e2e written first and green before the next slice starts. Risk is front-loaded: Step 1 proves the riskiest assumptions (Runner keeps the session open and follows Hub-owned status changes; overlay and ownership work against a real blocked Job) before any command execution exists. Later slices add one capability each on that proven path. A slice that finds an earlier assumption wrong fixes it there before continuing.

Overlay build-up (one component, grown in place, never replaced): Step 1 creates it in full layout (screenshot area, blocked step/reason, Transcript, owner/status, action bar with End Job, read-only and auto-close behavior) with the command inputs absent. Step 2 adds the resume selector and Hand Back to the action bar; Step 3 makes the screenshot clickable and adds the loading state; Step 4 adds the assign input; Step 5 adds the prompt input.

Test fixture for all slices: a Recipe whose Step fails without a recovery (see [examples.json](../../todos/supporting-docs/examples.json)), with a later Step reachable by resume.

---

### Step 1 — Take Control shell: see it, own it, end it

Capability: a blocked Job shows up everywhere, an operator takes control in an overlay, and can end the Job. No commands yet.

**Guard:** Written first, then green in this step.
- Multi-service e2e (`test-e2e/`): Recipe Job blocks → Job shows intervention status with link on Jobs, Customer, Registered Application, and Job views → Take Control opens the overlay with screenshot, blocked step/reason, transcript, owner → a second operator's take is rejected and their overlay is read-only → owner ends the Job → `Completed-Failed`, browser closed, Runner polls again. Also: cancel while `Interactive-User` and idle timeout after takeover both auto-close the overlay and show the new status.
- Hub integration: atomic take (concurrent takes, one wins), owner-only end, terminal Jobs never revived, Recipe cancel in intervention states, no `raw*`/unmasked reason in responses.
- Runner unit (fake Hub client): Interactive wait replaces the timeout-only `waitForIntervention`; before-takeover timeout; idle timeout after takeover; unexpected non-terminal status change → `Completed-Error`; `closeBrowserSession` on every path (extend `automaticLoop.cleanup.test.ts`).
- Component tests for the refresh interval choice (non-terminal → fast; terminal → slow; latest Transcript entry over 6 hours old → slow; switches after a refresh changes the status), using fake timers and a stubbed clock.
- Component tests for links/owner rendering, the overlay's read-only state, and auto-close on each status change away from `Interactive-User` (with the owner/status message).

**References**
- [Runner API](../../context/hub/backend/runner-api.md), [Job Queue](../../context/hub/job-queue.md), [Database handling](../../context/hub/backend/database-handling.md), [Repository return values](../../context/hub/backend/repository-return-value-conventions.md), [API conventions](../../context/hub/backend/api-request-response-conventions.md), [Server domain structure](../../context/hub/backend/server-domain-structure.md)
- [Recipe Automatic Loop](../../context/runner-web/recipe-automatic-loop.md), [Runner HTTP handling](../../context/runner-web/runner-http-handling.md), [Browser cleanup](../../context/runner-web/browser-cleanup.md)
- [Modals](../../context/hub/frontend/modals.md), [Components](../../context/hub/frontend/components.md), [Design system](../../context/hub/design-system.md), [API calling pattern](../../context/hub/frontend/api-calling-pattern.md), [Hub E2E conventions](../../context/hub/e2e/conventions.md)
- `jobRepository.ts`, `jobActions.ts` (`cancelJob`), `runnerActions.ts`, `storage/db/jobStatus.ts` and `lib/jobStatus.ts` (enums kept in sync), `automaticLoop.ts` (`waitForIntervention`), `runnerClient.ts`, `routes/jobs/[id]/_components/*`, `routes/customers/[id]`, `routes/registered-applications`, `routes/jobs/+page.svelte`, `StatusBadge.svelte`, `test-e2e/recipe-execution.spec.ts`

**Work:**
- Migration: `job_status` `Interactive-User` (id 8); `job.intervention_owner`; blocked step id and reason on the Job.
- Hub: take control, end Job; the Runner-facing status poll returns status and owner; cancel allowed for Recipe Jobs in intervention states; owner cleared on terminal; Transcript entries for takeover/end.
- Runner: report blocked Step id and masked reason with `Intervention-Requested`; wait loop that follows status/owner with pre- and post-takeover timeouts.
- UI: `operatorId` helper, links and owner/status on the four views, `Interactive-User` badge, overlay shell (screenshot, blocked step/reason, transcript, owner, End Job, lock/read-only states, polling refresh). Run `verify-ui`.
- Job page: choose the `RefreshIndicator` interval per R014 (a fast-interval constant beside `REFRESH_INTERVAL_SECONDS`).

---

### Step 2 — Hand back and resume

Capability: the owner can return control at a Recipe position and the Job continues to a terminal outcome in the same browser session.

**Guard:** Written first, green in this step.
- Multi-service e2e: take → hand back at a later Step → `Completed-Success`; hand back at the blocked Step while the blocker persists → `Intervention-Requested` again with new reason and owner cleared; invalid resume Step id rejected.
- Hub integration: resume-position validation, owner-only, `Running` clears owner and voids nothing else.
- Runner unit: `runProgram` starts from a Step id (existing location index), reports `Running`, re-requests intervention on resume failure.

**References**
- `automaticLoop.ts` (`runProgram` position/`resume`, `buildLocationIndex`), `runnerActions.ts`, the Step 1 overlay.

**Work:**
- Hub hand-back endpoint (validates Step id against the Recipe); Runner picks it up from the status poll and resumes; the overlay gains the resume selector (defaults to the blocked Step).

---

### Step 3 — Click command

Capability: the first interactive command, and with it the command protocol, so every later command reuses a proven path.

**Guard:** Written first, green in this step.
- Multi-service e2e: take → click a point on the screenshot that clears the blocker → screenshot and transcript update → hand back → `Completed-Success`; duplicate submit (same `commandKey`) executes once; second submit while pending gets 409; non-owner submit rejected; Job cancelled mid-command is not revived.
- Hub integration: single-pending rule, `commandKey` dedupe, void on status change, `raw*` fields never returned, Runner endpoint returns the pending command and accepts one result, wrong runner 403.
- Runner unit: executes a pending command once via `executeAction` with a `point` selector, uploads the masked screenshot, resets the idle timer, discards the result if status changed mid-command.
- Component: preview click maps to full-page image pixels; loading indicator appears on submit, blocks input, and clears only when the Transcript item and new screenshot have arrived; a status change while loading closes the overlay.
- The multi-service e2e asserts the loading indicator is visible after the click and gone once the new screenshot shows.

**References**
- [steps-dsl.md](../../todos/supporting-docs/steps-dsl.md) (point selector), `stepReporting.ts`, `stepActionResolver.ts`

**Work:**
- Migration `intervention_command` (job, key unique per job, kind, `raw_payload`, safe payload, status, result); Hub submit endpoint and Runner command/result endpoints; Transcript entries per command (R012).
- Runner: command execution inside the wait loop. Overlay: click-to-submit, loading state over the screenshot until the Transcript item and screenshot arrive (R013); Steps 4 and 5 reuse it.
- Write the draft ADR next to this spec (C007).

---

### Step 4 — Assign command

**Guard:** Written first, green in this step.
- Multi-service e2e: take → assign an output → hand back past the extraction → Results show the value; a sensitive output shows masked in Hub views.
- Hub integration: assign validated against output declarations and types (unknown name, wrong type rejected), sensitive value masked in Transcript and responses.
- Runner unit: assign runs as a DSL `assign` Step through `executeAction`.

**Work:**
- Extend command validation and the overlay with an assign input (`name=value`).

---

### Step 5 — Prompt command

**Guard:** Written first, green in this step.
- Multi-service e2e (LLM stub): take → prompt → the converted Step runs → hand back → `Completed-Success`; the stub sees exactly one call, and no call during Trial/Execute otherwise.
- Hub integration (stubbed LLM): valid conversion, invalid response with retry, retry exhausted returns an error and creates no command, only masked inputs in the prompt.

**References**
- `llm/nextStep.ts`, `llm/llmClient.ts`, `recipeDefinitionValidation.ts` (`validateAtomicStep`, verify reusable as named), [LLM call with validation retry](../../context/hub/backend/llm-call-validation-retry.md), `test-e2e/llm-stub/client.ts`

**Work:**
- `interventionPrompt.ts` converting a prompt to one validated atomic Step, then persisted as a normal command; overlay prompt input with error display.

---

### Step 6 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- Move the draft ADR into `docs/adrs/hub/` with its index.
- Update `job-queue.md`, `runner-api.md`, `recipe-automatic-loop.md` (remove "no Take Control path"), `browser-cleanup.md`, `runner-http-handling.md`.
- ARCHITECTURE.md Human Intervention: reconcile to the implemented model (Recipe Jobs only, idle timeout, resume by position with readiness proven by the resume Step, `operatorId` instead of a user id, overlay lock no longer FUTURE, single pending command, commands not persisted as Recoverable Scenarios). Update defer 3's prerequisites text.
- Add a defer (`write-defer`) for Training-Job intervention.

---

## Out of scope

- Training Job intervention (defer recorded in Step 6).
- Automatic Recipe revision from intervention (defer 3).
- Translating a coordinate click into a better selector, and persisting interventions as Recoverable Scenarios (both feed defer 3).
- Approval of a converted prompt Step before execution (ARCHITECTURE FUTURE).
- Runner-acknowledgment display and stale-Runner detection (ARCHITECTURE FUTURE); automatic stale-job retry.
- Real authentication or multiple named operators; multi-operator collaboration.
- Live streaming or video of the browser session; screenshots refresh only after commands.
- Structured failure reporting (todo item 3) and final verification (item 4).

## Traceability

- Source: [docs/todos/0005-the-rest-of-the-owl.md](../../todos/0005-the-rest-of-the-owl.md) item #2, "Add live Human Intervention"
