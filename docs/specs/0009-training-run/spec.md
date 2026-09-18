# Spec 0009: Training Run

## Goal

An operator can start a Training Run from a Registered Application with just a goal, starting URL, and step limit; the system drives a real browser through an LLM-directed discovery loop, and a successful run produces a validated draft Recipe the operator can review and start a Trial on — with no hand-written Steps.

## Requirements

- R001: Hub calls an OpenAI-scheme LLM using `.env`-sourced settings (base URL, API key, model); missing/invalid config crashes loudly, no silent fallback.
- R002: Starting a Training Run analyzes the goal text for probable input values, producing named, typed Ingredients with a sensitivity flag, stored on the Job before the Runner's first poll.
- R003: For each Training step, Hub sends the goal, summarized transcript, and current masked screenshot to the LLM and gets back one next DSL Step (Actions vocabulary, `steps-dsl.md`); an invalid/malformed response is corrected via a bounded retry before the Step reaches the Runner.
- R004: The Runner drives a real Playwright browser for Training: opens the starting URL, executes each Hub-issued Step, masks and reports a screenshot per step, and reports outcome/extractions — mirroring the existing Recipe Job's per-Step execution and masking, not a second implementation of either.
- R005: Reaching `maxSteps` without an explicit Finished Step fails the Job (`Completed-Failed`); an explicit model-issued Finished Step ends discovery immediately. Training Jobs get a per-step timeout (`training_job.step_timeout_ms`), mirroring `recipe_job`.
- R006: On `Completed-Success`, Hub compiles what this run actually observed (main Steps as executed, any recoveries actually triggered, declared inputs/outputs with sensitivity, a checkpoint) into a Recipe via the LLM, validated by the existing `validateRecipeDefinition`/`createDraftRecipe` path, with a bounded correction retry. A single run only ever walks one branch — the compiler does not invent untested alternate endings (e.g. a "not_found" path never observed).
- R007: A compilation failure is recorded and visible on the Job; it never silently produces or updates a draft Recipe.
- R008: The Registered Application screen shows a Job's newest draft Recipe first with "Start Trial"; a recipe review view shows its Steps, inputs/outputs, and irreversible-Step labels.
- R009: The Job screen links a Training Job to the draft Recipe it produced (when one exists).
- R010: An operator can confirm training data is synthetic to skip the third-party PII masking pass for that run (known-secrets masking always still applies) — resolves DEFER 4.
- R011: Every value sent to the LLM (transcript, Ingredients, Results) uses the existing masked/safe projection, never a raw sensitive value — mirroring `training-run.md` ("sensitive samples are masked in LLM/transcript projections") and the existing `maskValue`/`safeValue` pattern; this applies to Step-generation (R003) and compilation (R006) alike.
- R012: An operator can optionally provide alternate discovery goals alongside the primary goal (`training_job.alternate_goals`, `ARCHITECTURE.md`/`training-run.md`), passed to the Step-generation prompt as secondary objectives — this run's compiled Recipe still reflects only what was actually observed (R006).

## Constraints

- C001: No LLM SDK dependency without justification — draft an ADR if one is added; prefer a plain `fetch` client against the OpenAI-scheme chat completions endpoint, matching the codebase's existing "smallest change" bias and avoiding an unused-surface dependency.
- C002: LLM access stays Hub-only (ARCHITECTURE.md's LLM Security) — the Runner never calls the LLM or sees API credentials.
- C003: LLM-issued Training Steps are atomic Actions only (no `group`/`if`) — grouping and branching are introduced later, by Recipe compilation, not by the discovery loop.
- C004: Training's next-Step delivery stays synchronous within the Runner's existing `steps` report call (as scripted steps do today) — no new async/poll channel to wait on Hub's LLM latency. The Runner still makes two calls per iteration (artifact upload, then `steps` report), same order the Recipe Job loop already uses (`captureAndUploadArtifact` before/alongside `reportDslStep`); Step 4 must have the just-uploaded screenshot on hand (by `stepId`) before building the next-Step prompt inside the `steps` handler.
- C005: Extend `training_job`/`job_step_artifact` and reuse the existing Recipe DSL execution/masking primitives (`executeAction`, `takeMaskedScreenshot`, `validateRecipeDefinition`, `createDraftRecipe`) rather than modeling a separate `training_run` aggregate or a second DSL executor — observed Ingredients/Results/transcript already carry the same information a compiler needs. `training-run.md`'s richer hypothesis-tracking (proposed/confirmed/rejected status per field) is deliberately not adopted; record this as its own Defer in Step 8 rather than leaving `training-run.md` implying it's built.
- C006: Human-approval-before-irreversible-step and Human-Intervention-to-revised-Recipe remain (FUTURE)/deferred (ARCHITECTURE.md, DEFER 3) — a Training Step failure with no LLM correction still ends in existing `Intervention-Requested`/timeout handling, not a new flow.
- C007: Publish/promote UI (naming, superseding a prior Recipe) is not part of this spec — `publishRecipe` already exists server-side; only Start Trial and recipe review are needed here.

## Sequencing

Step 1's e2e guards stay red through Step 7 (they need the LLM client, both prompts, the real Runner loop, compilation, and the UI all in place to pass). An LLM stub HTTP server (new, under `test-e2e/`) plays the model's role in these tests and in Hub-side unit tests — no test hits a real OpenAI endpoint.

---

### Step 1 — E2E guards for a full Training Run

**Guard:** new Playwright specs in `test-e2e/`, red until Step 7.

**References**
- [Hub E2E test conventions](../../context/hub/e2e/conventions.md)
- [target-app tooling](../../context/tools/target-app.md) — same "local stand-in service" pattern to follow for the new LLM stub
- `ARCHITECTURE.md` Training Mode section

**Work:**
- Add a minimal local LLM stub server (`test-e2e/`) that serves canned OpenAI-scheme chat completions, scripted per test to walk BambooInvoice through a real discovery path.
- Test 1: enter a goal against BambooInvoice, watch the Job screen's transcript/screenshots update as the Runner executes real Steps, reach Finished, and confirm a draft Recipe is created and visible on the Registered Application screen with its Steps/inputs/outputs.
- Test 2: a goal with `maxSteps` too low to finish reaches `Completed-Failed` and produces no Recipe.
- Test 3: the LLM stub returns an invalid Step response once; confirm the run still completes (correction succeeds) — and a second scenario where every attempt is invalid, confirm `Completed-Error` and no Recipe.

---

### Step 2 — Hub LLM client

**Guard:** unit tests against the client using the Step 1 stub server (or an in-process fake), covering success, malformed JSON/schema response, and missing-config crash.

**References**
- `ARCHITECTURE.md` Overview (LLM role) and Application Security → LLM Security
- [API Request/Response Conventions](../../context/hub/backend/api-request-response-conventions.md)

**Work:**
- Add `OPENAI_BASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL` to `src/hub/.env.example` and a config loader that crashes on missing values (no default key/URL).
- Add a small `llmClient.ts`: one function that sends a chat-completion request (system + user messages) and returns the raw text response; no retry/streaming/tool-calling beyond what the two callers below need.
- If a library is added instead of `fetch`, write the ADR first (C001).

---

### Step 3 — Goal → Ingredients

**Guard:** unit tests: goal text with an embedded example value produces a named, typed, sensitivity-flagged Ingredient; an invalid LLM response is retried and then fails loudly if still invalid.

**References**
- `docs/todos/0004-01-training.md` item 1.3
- [job-queue.md](../../context/hub/job-queue.md) (`job_ingredient` shape)
- `src/hub/src/lib/server/repositories/jobRepository.ts` (`upsertJobIngredient`)

**Work:**
- System prompt + method: goal text → list of `{name, value, type, sensitive}`; validate the shape, bounded retry on invalid response, else crash the request (surfaced to the modal as a submit error — no Job created).
- Wire into Training Run creation (currently `StartTrainingModal.svelte` → `startTrainingRun`): call this before the Job is persisted, store results via `upsertJobIngredient`.
- Add an optional "Alternate goals" field to `StartTrainingModal.svelte` and a "This data is synthetic/non-sensitive" checkbox; add `masking`/`synthetic_data_confirmed`/`alternate_goals`/`step_timeout_ms` columns to `training_job` (new migration, mirroring `recipe_job.step_timeout_ms`) and thread the masking flag to the Runner's initial claim payload (R010, DEFER 4). Remove the resolved DEFER 4 entry from `docs/defers/_index.md` and delete its file.

---

### Step 4 — Goal/transcript/screenshot → next Step

**Guard:** unit tests: valid next-Step response passes through; malformed/unknown-action responses are corrected via retry; exhausted retries surface as an error the caller can turn into `Completed-Error`.

**References**
- [steps-dsl.md](../../todos/supporting-docs/steps-dsl.md) — Actions vocabulary to constrain the prompt/validator to
- `src/hub/src/lib/server/runnerActions.ts` (`reportJobStep`, `SCRIPTED_TRAINING_STEPS`/`toWireStep`)
- `src/hub/src/lib/server/recipeDefinitionValidation.ts` — reuse/extend for single-Step (atomic-only, C003) validation

**Work:**
- System prompt + method: `{goal, alternateGoals, transcript summary, masked screenshot, DSL vocabulary}` → one atomic `ChildStep`; validate against the DSL grammar (atomic actions only), bounded correction retry. Transcript/Ingredient/Result values passed to the prompt use the existing masked/safe projection (R011), never `rawValue`.
- Replace `SCRIPTED_TRAINING_STEPS`-driven branches in `reportJobStep`'s `step` handling with this call; delete `scriptedTrainingSteps.ts` and the now-dead `SCRIPTED_TRAINING_STEPS.length`/`toWireStep` references; keep the existing synchronous "next Step returned in the same response" shape (C004).
- Drop the artifact-upload endpoint's Recipe Job-only restriction so Training can upload its per-step masked screenshot the same way (by `stepId`) before calling `steps`; the `steps` handler looks up that Job+stepId's artifact when building the next-Step prompt (C004).
- An explicit model-issued Finished Step ends the Job as `Completed-Success` (R005) without waiting for `maxSteps`.

---

### Step 5 — Runner Training loop

**Guard:** unit tests mirroring `automaticLoop.test.ts` coverage: open → execute → report → next-Step loop; terminal Finished/fail/maxSteps handling; browser session cleanup on every exit path.

**References**
- [Recipe Automatic Loop](../../context/runner-web/recipe-automatic-loop.md) — the primitives and cleanup pattern to reuse, not re-decide
- `src/runner-web/orchestrator/automaticLoop.ts`, `src/runner-web/browser/actions.ts` (`executeAction`), `src/runner-web/browser/screenshotMasking.ts`

**Work:**
- Add a Training counterpart to `runRecipeJobLoop`: open the starting URL, then loop — execute the current Step via `executeAction`, mask+report a screenshot, report the outcome, receive the next Step (or terminal status) from the same call, repeat.
- Reuse `launchBrowserSession`/`closeBrowserSession` and the allowlist route handler as-is; apply `syntheticDataConfirmed` to skip the third-party PII pass (known-secrets masking always runs), per `screenshotMasking.ts`/ADR 0001.
- Wire the poll response's Training branch (already returns `nextStep`) into this loop instead of whatever currently drives the scripted stand-in on the Runner side.

---

### Step 6 — Recipe compilation

**Guard:** unit tests: a successful transcript compiles to a Recipe that passes `validateRecipeDefinition`; an invalid compiled definition is retried and then recorded as a compilation failure with no Recipe row written (R007).

**References**
- [recipe.md](../../todos/supporting-docs/recipe.md), [examples.json](../../todos/supporting-docs/examples.json) (target Recipe shape)
- `src/hub/src/lib/server/repositories/recipeRepository.ts` (`createDraftRecipe`)

**Work:**
- System prompt + method: `{goal, masked transcript, observed Ingredients/Results (safe values only, R011)}` → a `RecipeDefinition` reflecting only the path this run actually walked (main Steps in order, any recoveries actually triggered, one checkpoint, declared inputs/outputs with sensitivity from the observed Ingredients/Results) — no synthesized alternate branches (R006).
- On `Completed-Success`, run compilation; on success call `createDraftRecipe` (validation already enforced there) with `sourceTrainingRunId` set to the Job id; on exhausted retries, append a transcript entry recording the compilation failure — Job status stays `Completed-Success`, no Recipe is created.

---

### Step 7 — UI: draft Recipe visibility

**Guard:** component/integration tests for the new recipe list and review view; the Step 1 e2e specs go green.

**References**
- `src/hub/src/routes/registered-applications/[id]/+page.svelte`, `StartRecipeJobModal.svelte`
- `src/hub/src/lib/server/repositories/recipeRepository.ts` (`listRecipesForApplication`)
- `docs/context/hub/frontend/components.md`

**Work:**
- Load and render `listRecipesForApplication` on the Registered Application screen: newest draft first with "Start Trial", then Released Recipes with "Start Job" (R008) — replace the current always-visible static buttons.
- Add a recipe review view (Steps with intent text, inputs/outputs with sensitivity, irreversible-Step labels) linked from that list.
- Link a Training Job's resulting draft Recipe from the Job screen (R009) when `compiledRecipe`/a matching `sourceTrainingRunId` exists.
- Run `verify-ui` on the changed screens.

---

### Step 8 — Docs

**Guard:** none (docs-only).

**Work:**
- `write-adr` for the LLM client dependency choice (or its "no new dependency" decision, C001).
- `write-defer` for `training-run.md`'s hypothesis-tracking model (proposed/confirmed/rejected per field, C005) — not built; observed Ingredients/Results/transcript stand in for it.
- `write-defer` for goal-text masking (Open Question 1) — a sensitive value embedded in the goal string is not masked anywhere this spec touches.
- `write-agent-context` for: the Hub LLM-call-with-validation-retry pattern (Steps 3/4/6), and the Runner Training loop (Step 5) — add both to the relevant `_index.md` reference lists.
- Update `CHANGELOG.md`.

---

## Out of scope

- Publish/promote UI (C007) — naming, superseding, archiving a prior Recipe.
- Human Intervention "Take Control" during Training and Intervention→revised-Recipe (DEFER 3, ARCHITECTURE.md FUTURE).
- Approval-Requested pause for irreversible Steps mid-training (ARCHITECTURE.md FUTURE, item 273).
- Multi-tenant/RBAC, Runner registration flow, and other items already marked (FUTURE) in ARCHITECTURE.md.
- Any change to Trial/Execute (Recipe Job) execution — this spec only adds a Training-mode driver alongside it.
- Masking a sensitive value embedded in the goal text itself (see Open Question 1) — the goal string stays unmasked wherever it's stored, shown, or transmitted.

## Traceability

- Source: [docs/todos/0004-01-training.md](../../todos/0004-01-training.md), plus its linked [ARCHITECTURE.md](../../../ARCHITECTURE.md), [steps-dsl.md](../../todos/supporting-docs/steps-dsl.md), [recipe.md](../../todos/supporting-docs/recipe.md), [examples.json](../../todos/supporting-docs/examples.json), [training-run.md](../../todos/supporting-docs/training-run.md)

## Open questions for the user

1. Step 3: the goal text an operator types can itself embed a sensitive example value (e.g. "look up account ACCT-1042"), and the idea doc flags this unresolved ("we need to consider when we mask it in the goal input (completion of the job?)"). Once R002 identifies which substring is sensitive, should the stored/displayed/transmitted goal be masked?
   User Answer: Leave goal-text masking out of this spec — filed as its own Defer (Step 8) instead.

