# Spec 0010: Bug Fixes Batch 1

## Goal

A user watching a Job (Training Run or Recipe) sees an accurate, useful Transcript and Job page: status colors render everywhere the design calls for them, the page title and Start Job modal don't show broken/misleading states, screenshots tied to a Step are visible and viewable full-size, a duplicate Step id from the LLM is retried instead of failing the run, and a failed Training Run can be retried without re-entering its inputs.

## Requirements

- R001: The Job Strip's Status cell and Transcript rows render the mockup's background/accent color for every `JobStatus`, including `Intervention-Requested` and `Completed-Error` (currently only `pending/running/success/failed/cancelled` are styled).
- R002: A Training Run's Job page title reads "Training Run" instead of the goal text.
- R003: The Start Job modal shows a loading state while Recipes are being fetched, never "No published Recipes are available" before the fetch resolves.
- R004: Each Step transcript row carries its Step id as its own field, and shows an image-icon affordance when that Step has an artifact; clicking it opens an overlay showing the transcript text above the screenshot, sized to the viewport with ~20px margin and a close button.
- R005: The Job page's final-screenshot panel gets a "View larger" control that opens the same overlay.
- R006: A Training-Run next-Step LLM response that reuses a Step id already used in the run is treated as an invalid response and retried within the existing bounded-retry loop, not surfaced as an immediate `Completed-Error`.
- R007: A "Retry Job" button appears on a Training Run's Job page (after Export JSON), opens the Start Training Run modal pre-filled from that Job, and on submit creates and navigates to a new Job exactly like the existing "Begin a Training Run" flow.
- R008: The Runner reports a `targetDescription` (`{ component: string, selector: string }`, an English description of the Step's existing selector) for every Step it executes; Hub requires and stores it per Step, exposes `stepId`, `outcome`, `action`, and `targetDescription` as separate fields in the Job API and JSON export (no combined `message`), and the Transcript row displays an English message built from them, e.g. `{stepId}: click on button(label='Save')`.

## Constraints

- C001: `component` mapping (R008): input → `{type} input`, `select` → `Dropdown`, unmapped tag → `element`.
- C002: `selector` (R008) is the first of these that resolves, else empty: `id='{id}'` → button `label='{label}'` → link inner text → `<label>` linked via the text input's `id` → nearest ancestor `<label>` → empty. Selector never contains a value the Step typed or read (`fill`/`read`, never `input.value`), only structural/label identification, and is length-truncated.
- C003: Follow `docs/context/hub/frontend/modals.md` for modal changes (loading state, Retry prefill, overlay).
- C004: Follow `docs/context/hub/backend/llm-call-validation-retry.md` for R006 — the duplicate-id check joins the existing validate/retry loop in `nextStep.ts`, not a new mechanism.
- C005: R008 changes the Runner→Hub `dslStep` wire contract (`docs/context/hub/backend/runner-api.md`); `runner-web` and `hub` move together, no fallback for a missing `targetDescription` (let it crash — CLAUDE.md).
- C006: Page-derived text in `selector` (button/link/label text) is potentially sensitive: each candidate value is tested against the Runner's text masking (`textRedaction.ts` `redactKnownSecrets` with the Job's secrets); a candidate that would be changed by masking is skipped and the chain continues to the next candidate.
- C007: Existing Job data is discarded via `db:reset` — no migration or backfill for old Step transcript rows; the new stored Step shape is the only shape.

## Sequencing

Requirement → Step: R001–R003 → 1; R006 → 2; R007 → 3; R008 → 4; R004–R005 → 5. Steps 1–3 are independent and follow existing patterns. Step 4 restructures `StepTranscriptText` (adds `stepId`, `outcome`, `targetDescription`); Step 5 (overlay) reads that `stepId` and so goes after it, avoiding two changes to the same shape.

---

### Step 1 — Status colors, Training Run title, Start Job loading state

**Guard:** Component tests: `JobStrip` and `TranscriptPanel` render the `intervention`/`error` variant classes for those two statuses; Training Run `<h1>` reads "Training Run"; `StartRecipeJobModal.test.ts` asserts a loading message while `fetchRecipes` is pending and no empty-state message until it resolves empty. Cross-check colors against `docs/design/Hub Job Page.dc.html`.

**References**
- `src/hub/src/routes/jobs/[id]/_components/JobStrip.svelte`, `TranscriptPanel.svelte` — `.strip-status-*`/`.transcript-rail-*` cover 5 of 7 variants; tokens `$status-intervention-*`/`$status-error-*` already exist in `variables.scss`
- `src/hub/src/routes/jobs/[id]/+page.svelte:98` — `<h1>{job.details.goal}</h1>`
- `src/hub/src/routes/registered-applications/[id]/_components/StartRecipeJobModal.svelte` — `load()`; `recipes` starts `[]` so the empty branch renders before the fetch resolves
- `docs/context/hub/frontend/modals.md`

**Work:**
- Add `intervention`/`error` rules to `JobStrip.svelte` (`panel-strip-status-cell`) and `TranscriptPanel.svelte` (`transcript-rail`).
- Replace the Training Run `<h1>` with the literal "Training Run".
- Add a `loading` state to `StartRecipeJobModal` set for the duration of `load()`, rendered before the empty/list branches.

---

### Step 2 — Duplicate Step id retried inside the LLM loop

**Guard:** Unit test: `deriveNextStep` with a stubbed `sendChatCompletion` returning a reused id then a fresh id succeeds on the second attempt; a reused id on every attempt throws `NextStepInvalidResponseError`. Update the existing integration test asserting the post-hoc "LLM reused an already-used Step id" `Completed-Error` so it only fires after retries are exhausted. Retry prompt must carry the collision error back to the LLM.

**References**
- `src/hub/src/lib/server/llm/nextStep.ts` — `NextStepContext`, `deriveNextStep`, `parseNextStep`
- `src/hub/src/lib/server/jobs/trainingRunJobs/reportDslStep.ts:119-136` — post-hoc check to remove; `listTrainingRunJobSteps` is the source of used ids
- `docs/context/hub/backend/llm-call-validation-retry.md`

**Work:**
- Add `knownStepIds: string[]` to `NextStepContext`; `parseNextStep` checks `step.id` after `validateAtomicStep` (leave the shared validator unchanged) and throws on collision, so the loop retries. Include the used ids in the prompt payload so the retry can differ.
- Pass `listTrainingRunJobSteps(...).map((s) => s.stepId)` from `reportDslStep.ts`; delete the post-hoc check. Training Runs only; Recipe Jobs are unaffected.

---

### Step 3 — Retry Job button

**Guard:** `StartTrainingModal.test.ts`: with initial values the fields are pre-filled and reset to blank when none are given. Hub e2e: on a Training Run Job page, "Retry Job" opens the modal pre-filled; submitting navigates to a new Job page.

**References**
- `src/hub/src/routes/registered-applications/[id]/_components/StartTrainingModal.svelte` — `resetForm()` always blanks the fields; `StartRecipeJobModal`'s `initialRecipeId` is the precedent for an initial-value prop
- `src/hub/src/routes/jobs/[id]/+page.svelte` — Training Run header actions; `TrainingRunJob` in `$lib/types/job.ts` holds the values to prefill
- `src/hub/e2e/start-training-modal.spec.ts`

**Work:**
- Add an optional initial-values prop to `StartTrainingModal` (goal, startingUrl, maxSteps, alternateGoals, syntheticDataConfirmed per Open Question 3) applied in place of the blank reset on open.
- Render "Retry Job" after "Export JSON" on the Training Run branch of the Job page, only when the Job's status is `Completed-Failed` or `Completed-Error` (the bug is about retrying a failed job), opening the modal with `registeredApplicationId = job.customerApplicationXrefId` and the Job's values.

---

### Step 4 — Runner-reported target description; structured Step transcript fields

**Guard:** `runner-web` unit tests: fixture page yields the expected `{component, selector}` per C001/C002, a candidate matching a known secret is skipped in favor of the next candidate, and `fill`/`read` never put a typed/read value in `selector`. Hub: `parseReportStepBody` rejects a `dslStep` body missing `target`; integration test round-trips `stepId`/`outcome`/`targetDescription` through the transcript row and Job API/JSON as separate fields, with `action` resolved from the Step definition via `stepId`; `TranscriptPanel` renders `{stepId}: {action} on {component}({selector})`.

**References**
- `src/runner-web/browser/actions.ts` (`executeAction`, `ActionOutcome`) and `browser/targetResolver.ts` (`resolveElementTarget` returns the `Locator`)
- `src/runner-web/orchestrator/automaticLoop.ts:173` (`reportChildOutcome`) and the equivalent in `trainingLoop.ts`; `src/runner-web/runnerClient.ts` (`ReportDslStepRequest`)
- `src/hub/src/lib/server/jobs/jobActions.ts` `parseReportStepBody` (`dslStep` case); `trainingRunJobs/reportDslStep.ts:58` and `recipeJobs/reportDslStep.ts:46` build the `message` being replaced; `StepTranscriptText` in `jobRepository.ts` and `$lib/types/job.ts`
- `docs/context/hub/backend/runner-api.md`; ARCHITECTURE.md (masking before data leaves the Runner; per-Step structured details)

**Work:**
- `runner-web`: `describeTarget(locator, secrets)` next to `targetResolver.ts` implementing C001/C002, skipping any candidate the masking (C006) would alter; call it for every action that resolves a single-element `Locator`; thread it through `ActionOutcome` to `reportDslStep`. `open` navigates the browser rather than acting on an element, so it reports `{ component: "browser", selector: "" }`. Other actions with no element (`scroll`, `goto`, `finish`, `fail`, `assign`, point targets) report `{ component: "element", selector: "" }`.
- `hub`: `parseReportStepBody` requires `targetDescription` like `stepId`/`outcome`. `StepTranscriptText` gains `stepId`, `outcome`, `parentStepId?`, `targetDescription`; both `reportDslStep.ts` files store them instead of the folded `message`; update the mirrored client type. No migration for existing rows (C007).
- Job API assembly (`jobRepository.ts` transcript mapping / `getJobDetail`) resolves each Step row's `action` from its `stepId`: Training Runs via `training_job_step.definition`, Recipe Jobs via the Recipe definition's Steps (child Steps included). A `stepId` that resolves to no Step crashes (no fallback).
- `TranscriptPanel.svelte` renders `{stepId}: {action} on {component}({selector})` for Step rows, dropping `({selector})` when the selector is empty. `open` Steps render `{stepId}: navigate to URL` instead.
- Update `runner-api.md` for the new field.

---

### Step 5 — Screenshot overlay: transcript icon and larger final screenshot

**Guard:** Overlay component test (renders transcript text + image, closes via the close button). `TranscriptPanel`: a Step row whose `stepId` matches an artifact shows the icon; clicking opens the overlay with that image. `ScreenshotPanel`: "View larger" opens the same overlay.

**References**
- `TranscriptPanel.svelte`, `ScreenshotPanel.svelte`, `+page.svelte` (`job.artifacts`); `JobStepArtifact.stepId` in `$lib/types/job.ts`
- Artifact URL: `/api/hub/jobs/{jobId}/artifacts/{artifactId}`
- `docs/context/hub/frontend/modals.md`, `docs/design/Hub Job Page.dc.html`

**Work:**
- New page-local `ScreenshotOverlay.svelte` per the modals pattern: props `open`, `onClose`, `text`, `imageUrl`; native `<dialog>`, ~20px margin, text above image, close button.
- `TranscriptPanel` takes `artifacts`; Step rows matching an artifact's `stepId` (latest artifact if several) render an icon button opening the overlay with the row's rendered Step message text.
- `ScreenshotPanel` adds "View larger" using the same overlay.

---

### Step 6 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- Update `docs/context/hub/frontend/modals.md` if the overlay/prefill introduces a pattern worth recording; confirm `runner-api.md` was updated in Step 4.

---

## Out of scope

- Redesign of Transcript/Job Strip visuals beyond wiring the two missing status colors.
- Retry/pre-fill for Recipe Jobs (R007 is Training-Run-only).
- Changing `steps-dsl.md`'s Step-id uniqueness rule.
- ARCHITECTURE.md's other per-Step Runner-reported fields (sensitive-field indicator, suggested better selector); only `targetDescription` is added here.
- Take Control / Intervention flow behavior beyond the status color.

## Traceability

- Source: [docs/todos/0006-bugs.md](../../todos/0006-bugs.md), item 1 (Almost Bugs) and items 1–8 (Bugs during testing)

## Open questions for the user

1. Step 4: the todo names the body field `target` but its type `targetDescription`. Is the wire/JSON key `target` (sibling of `stepId`/`outcome`)?
   User Answer: Use `targetDescription`, an English description of the Step's existing selector. The Transcript message combines the Step's action (cross-referenced from the Recipe/Training Step via `stepId`) with it, e.g. "click on button(label='blah')", so `stepId` must be wired through first.
2. Step 4: `selector` text comes from the page (button label, link text, `<label>`) and can carry PII (customer names, invoice numbers) and would land in the DB, transcript, and JSON export unmasked. Should the Runner run it through its existing secret/PII masking before reporting, restrict it to structural attributes (id/type), or accept it as-is?
   User Answer: Test the value against the mask; if it would be masked, don't use that value (continue down the chain).
3. Step 3: should Retry pre-check "This data is synthetic/non-sensitive" from the original Job, or require the user to re-confirm?
   User Answer: Copy the consent over from the original Job.
4. Step 4: how should existing Step transcript rows (no `stepId`/`outcome`/`target` in stored JSON) be handled — migrate with empty values, or rely on `db:reset`?
   User Answer: Assume a db reset; the new data structure needs to be right rather than backward compatible.
