# Spec 0014: Recipe Compilation Completion

## Goal

A completed Training Run compiles into a Recipe that is the *ideal* repeatable sequence (not a replay of the exploratory run), carries the recoveries the run revealed, has a short readable name, and whose label-targeted Steps actually work on the target app.

## Requirements

- R001: Compilation is four focused LLM calls run in order, each with its own prompt, response validation and bounded retry, each building on the validated result of the prior: (1) schema: final inputs/outputs derived from the goal, (2) ideal Steps, (3) recoveries, (4) name.
- R002: Call 1 drops observed Results not needed by the goal from the Recipe's outputs (Recipe variables are not in the DSL or ARCHITECTURE.md, so nothing is converted).
- R003: Call 2 produces an ideal Step list: dead ends, retries and unneeded reads removed, `if` conditionals allowed, ending in the deterministic finish checkpoint over the final outputs.
- R004: Call 3 produces `recoveries` (description, condition, Steps; a recovery may end in a `fail` Step to report failure) for recoverable scenarios visible in the journal.
- R005: Call 4 produces a Recipe name of at most 40 characters, used for the draft Recipe instead of the raw goal; publish also caps names at 40.
- R006: Calls 2 and 3 receive one combined "journal": an array of transcript entries where each entry that ran a Step carries that Step as a child (`step`): the transcript outcome, the DSL Step as executed, and its `targetDescription` (which may offer a better selector).
- R007: The DSL reference (targets, actions, conditions, semantics) is a shared template used by the next-Step prompt and the compilation prompts, so it is written once; each prompt keeps only its own task and rules.
- R008: `fill` (and other element actions) targeting `{by:"label"}` succeed on BambooInvoice's login form, where the label is linked to the input by id.

## Constraints

- C001: Every call's output is validated before the next runs (calls 2 to 4 via `validateRecipeDefinition` on the definition assembled so far, call 4 for name length); exhausting a call's retries raises `RecipeCompilationInvalidResponseError` naming the stage. No silent fallback to the raw executed Steps, no truncation.
- C002: Every compiled Step carries an `intent`, as today.
- C003: The finish checkpoint stays deterministically assembled, never LLM-authored.
- C004: The label failure's root cause is established by reproduction before a fix is chosen; the failure may be in resolution or in the action itself (the transcript shows only `observed: fill on element`).
- C005: No credential or sensitive value may reach any LLM prompt or the UI-visible transcript through this work; the journal uses only already-masked transcript text and already-redacted target descriptions, and surfaced action errors are redacted against the run's secrets (a fill error can echo the filled value).

## Sequencing

Each step's guards go red then green within that step.

---

### Step 1 — Label targeting (R008, C004, C005)

**Guard:** runner-web unit test (real page fixture mirroring the BambooInvoice login markup, label `for` → input `id`) written after reproduction, red before the fix; `test-e2e/` case where a Recipe using `{by:"label", value:"Username"}` `fill` logs into BambooInvoice; unit test that a failed Step's `observed` line shows the redacted underlying error.

**References**
- [docs/context/tools/target-app.md](../../context/tools/target-app.md)
- `src/runner-web/browser/targetResolver.ts` (`toLocator`), `src/runner-web/browser/actions.ts` (`runAction` catch, `resolveRequiredLocator`), `src/hub/src/routes/jobs/[id]/_components/TranscriptPanel.svelte` (`observedMessage`)
- `src/hub/src/lib/server/llm/prompts/nextStepPrompt.ts` (label targeting guidance)

**Work:**
- First, surface the redacted underlying error in the failed Step's `observed` line so the failure is diagnosable.
- Reproduce against the local target app; identify the failing layer (resolver, action, or model-emitted label text) and fix it there.

---

### Step 2 — Shared DSL prompt template and journal builder (R006, R007, C005)

**Guard:** unit tests: the next-Step prompt text is unchanged after extraction (snapshot of the rendered prompt before/after); journal builder joins transcript entries to `training_job_step` definitions by stepId, nests `step` (definition + targetDescription) under its entry, leaves non-Step entries (status/info) without one, and never includes anything not already masked.

**References**
- `src/hub/src/lib/server/llm/prompts/nextStepPrompt.ts` (the `# DSL` section is the shared part; `# Rules` and the response instruction are next-Step-specific)
- `src/hub/src/lib/server/transcriptSummary.ts` (`summarizeTranscriptForLlm`), `src/hub/src/lib/server/storage/repositories/jobRepository.ts` (`targetDescription`), `listTrainingRunJobSteps`

**Work:**
- Extract the DSL section into an exported template/constant consumed by `NEXT_STEP_SYSTEM_PROMPT`; the compilation prompts consume it too.
- Add a journal builder next to `summarizeTranscriptForLlm` that produces the combined array.

---

### Step 3 — Schema and ideal Steps calls (R001–R003, C001–C003)

**Guard:** `recipeCompilation.test.ts` (per stage, stubbed LLM): call 1 accepts an outputs subset and rejects unknown/renamed names; call 2 receives call 1's outputs and the journal, its Steps replace the executed Steps, Steps referencing a dropped output are rejected (validator already checks output refs, `recipeDefinitionValidation.ts:258`), finish checkpoint built only from final outputs; each stage retries then throws a stage-named error.

**References**
- `src/hub/src/lib/server/llm/recipeCompilation.ts`, `.../prompts/recipeCompilationPrompt.ts`
- `src/hub/src/lib/server/recipe/recipeDefinitionValidation.ts`
- [docs/todos/supporting-docs/steps-dsl.md](../../todos/supporting-docs/steps-dsl.md)

**Work:**
- Split the current single call into a per-stage structure (one prompt file, one parse/validate function per stage, shared bounded-retry loop); stage 1 keeps today's schema logic plus the goal-driven output selection.
- Add the ideal-Steps stage; remove the "never alter Steps" rule and update the R006-era header comments.

---

### Step 4 — Recoveries, name, publish cap, docs (R004, R005, C001)

**Guard:** `recipeCompilation.test.ts`: call 3 accepts valid recoveries (including one ending in `fail`) and rejects invalid ones; call 4 rejects missing/over-40 names then retries. `reportDslStep` integration: draft Recipe saved with the compiled name. Publish action/modal tests: over-40 name rejected. Hub e2e: compiled draft shows a ≤40 name. `npm run guard:tools:md-links`.

**References**
- `src/hub/src/lib/server/jobs/trainingRunJobs/reportDslStep.ts` (passes `job.details.goal` as name today)
- `src/hub/src/lib/server/recipe/recipeActions.ts`, `src/hub/src/routes/registered-applications/[id]/_components/PublishRecipeModal.svelte`
- ARCHITECTURE.md (Recoverable scan, lines 187-191)

**Work:**
- Add the recoveries and name stages; one shared `MAX_RECIPE_NAME_LENGTH = 40` used by stage 4 validation and publish (server + modal `maxlength`).
- Pass the compiled name to `createDraftRecipe`.
- Update hub context docs on compilation; add defer records for Recipe variables and for "compiled Recipe is not replayed before Draft".

---

## Out of scope

- Recipe variables (`var` refs / converting outputs to vars).
- Replaying or trialling the compiled Recipe before it becomes a Draft.
- Recompiling or renaming existing Recipes.
- Human Intervention feeding compilation ([defer 0003](../../defers/0003-intervention-to-revised-recipe.md)).
- Changing what the next-Step loop sends to the LLM (its input stays as is; only its DSL text is extracted).

## Traceability

- Source: [docs/todos/0008-more-issues.md](../../todos/0008-more-issues.md) items 1–3; user direction on splitting compilation into four calls, templating the DSL prompt content, and the combined journal input
