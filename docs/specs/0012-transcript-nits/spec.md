# Spec 0012: Transcript Nits & Target ValueRefs

## Goal

Operators reading a Job see its true type (Training Run, Trial, Execute), a scannable transcript that expands to the Recipe step behind each row, and an export that includes the Recipe or Run definition; Recipes can target elements by an input value instead of a hard-coded string.

## Requirements

- R001: A Target's `value` (by text/label/placeholder/css) may be an `input` ValueRef, resolved by the Runner at execution. `output`/`credential` refs are not allowed in Targets.
- R002: Seeded Recipes click the invoice link by `{ref:"input", name:"invoiceNumber"}` instead of literal `INV-1001`. Recipe Jobs only; Training Runs have no Recipe inputs and are unaffected.
- R003: The Job screen eyebrow shows Training Run, Trial, or Execute (Recipe Jobs by `mode`), not the generic Recipe job type.
- R004: Export JSON: Trial/Execute → `{ recipe: {...}, transcript: {...current export...} }`; Training Run → `{ run: {...steps/ingredients...}, transcript: {...current export...} }`.
- R005: Transcript row order: time, kind, text, gap, status badge, screenshot button, toggle.
- R006: Step row text shows the Step's `intent` (not `stepMessage(step)`), falling back to `stepMessage(step)` when the Step has none; input/output lines via `transcriptStepField` unchanged.
- R010: LLM-compiled draft Recipes must have `intent` on every Step (verified, and enforced if not already).
- R007: Screenshot button is a simpler icon/emoji, 10-20% subtler grey/slate, larger click area than today but smaller than the row height (negative margin allowed).
- R008: Every Step row has a toggle; other rows hold an invisible, non-interactive placeholder in the same column (screenshot and toggle columns are fixed-width so they align down the list). Expanded state survives the Job page's 5s refresh (keyed by row `sequence`). Pressed, it expands a detail area below the unchanged top row: same row background, indented to the text column plus `$space-l`.
  - Line 1: `id: {stepId}`
  - Line 2: `outcome: {outcome}`
  - Line 3: `recipe step:` `<StepDescription />` of the Step found by step id
  - Line 4: `observed:` the `stepMessage(step)` text without its `{stepId}: ` prefix
- R009: DEFER records for: pretty 404/500 pages and API 404 messaging; `plan` transcript kind; `observe` transcript kind.

## Constraints

- C001: Non-Step rows have no toggle and no detail area, only the placeholder space.
- C002: Step lookup by id throws if the id isn't found (impossible by design); it covers nested `group`/`if` children and recoveries; Training Run steps come from the run's saved Steps, Recipe Jobs from the Recipe definition.
- C003: Exports/displays carry no raw sensitive values (credentials stay refs; ingredients already masked).
- C004: An `input` marked sensitive, once resolved into a Target, never reaches the transcript, target description, `stepMessage`, LLM prompts or error messages unmasked.
- C005: Existing databases keep the old seeded Recipes until `db:reset`; the seed change is not migrated.

## Sequencing

Each step carries its own guards and doc updates. Step 3 depends on Step 2's definition data.

---

### Step 1 — ValueRef in Target values + seed fix

**Guard:** Unit: Hub `recipeDefinitionValidation` accepts/rejects ref targets (unknown input, existing ref rules); Runner `targetResolver` resolves a ref; `TargetDescription`/`StepDescription` render one; target description never leaks a sensitive resolved value. E2E (`test-e2e/recipe-execution.spec.ts`): seeded Recipe clicks the invoice by the supplied `invoiceNumber`.

**References**
- `src/hub/src/lib/types/recipeDefinition.ts`, `src/runner-web/dsl/types.ts`
- `src/runner-web/browser/targetResolver.ts`, `targetDescription.ts`, `conditions.ts`
- `src/hub/src/lib/server/recipe/recipeDefinitionValidation.ts`, `src/hub/src/lib/components/step/TargetDescription.svelte`
- `src/hub/src/lib/server/storage/db/seed.ts` (drop `SEEDED_INVOICE_LINK_TEXT` and its comment)
- [steps DSL](../../todos/supporting-docs/steps-dsl.md); LLM prompts in `src/hub/src/lib/server/llm/prompts/`

**Work:**
- `TargetElement.value: StringValue` in Hub and Runner; validation/resolution follow existing `StringValue` handling (`open`/`fill`).
- Seed `open_invoice` uses the `invoiceNumber` ref.
- Update DSL docs/context that state targets are literal.

---

### Step 2 — Job screen: type label and export with definition

**Guard:** E2E (`src/hub/e2e/job.spec.ts`): Trial and Execute Jobs show their mode in the eyebrow; downloaded JSON has `recipe`/`run` + `transcript`. Unit for the label mapping and `exportJson` shape. Integration: Job detail includes the Recipe definition (Recipe Jobs) or the Run's saved Steps (Training), and a Step with a sensitive fill/output value shows no raw value in the API response or export (C003).

**References**
- `src/hub/src/lib/types/job.ts` (`JobDetail`), `src/hub/src/routes/api/hub/jobs/[id]/+server.ts`, `jobRepository.ts`
- `src/hub/src/routes/jobs/[id]/+page.svelte` (`exportJson`, two call sites)

**Work:**
- Derive the eyebrow label from job type + `details.mode` (`JOB_TYPE_LABELS` in `+page.svelte`, `src/hub/src/lib/jobType.ts`).
- Add `recipe` / `run: { steps, ingredients }` to `JobDetail`.
- `exportJson` wraps the current job JSON as `transcript`.
- Update the Hub API context doc if it lists the Job detail shape.

---

### Step 3 — Transcript row: layout, intent, screenshot button, toggle

**Guard:** Component tests for `TranscriptPanel`: intent text, cell order, toggle expand/collapse and persistence across refresh, detail lines, nested-step lookup, intent fallback, non-Step row placeholder (no button, column aligned), step id not found throws. E2E (`job.spec.ts`): expand a row and see id/outcome/recipe step/observed. Update the visual baseline if one covers the Job page (check `src/hub/e2e` for the file).

**References**
- `src/hub/src/routes/jobs/[id]/_components/TranscriptPanel.svelte`
- `src/hub/src/lib/styles/_mixins.scss` (`transcript-row`, `transcript-cell-*`), [design system](../../context/hub/design-system.md)
- `src/hub/src/lib/components/step/StepDescription.svelte`

**Work:**
- Pass step definitions (Step 2) into `TranscriptPanel`; reorder cells and grid columns.
- Step text = looked-up `intent`, else `stepMessage(step)`; keep `transcriptStepField` lines.
- Restyle screenshot button (R007); add toggle and detail area (R008), with placeholders for non-Step rows.

---

### Step 4 — Require intent on LLM-compiled draft Recipes

**Guard:** Unit: a compiled definition with a Step missing `intent` is rejected by the compilation path (`RecipeCompilationInvalidResponseError`); if validation already requires it, add only the test that proves it.

**References**
- `src/hub/src/lib/server/llm/recipeCompilation.ts`, `prompts/recipeCompilationPrompt.ts`, `src/hub/src/lib/server/recipe/recipeDefinitionValidation.ts`

**Work:**
- Verify whether compiled drafts can omit `intent`; if so, require it for the compiled path (and the prompt) without making it required for hand-authored Recipes unless validation already does.

---

### Step 5 — DEFER records

**Guard:** `npm run guard:tools:md-links`.

**References**
- [write-defer skill](../../../.claude/skills/write-defer/SKILL.md), `docs/defers/_template.md`, `docs/defers/_index.md`

**Work:**
- Add DEFER 7-9 (R009) and index rows, using the reasoning in the todo.

---

## Out of scope

- Emitting an "Observe" transcript row on point clicks (todo item 1; dropped by the user, see DEFER 9).
- Implementing 404/500 pages, `plan` kind, `observe` kind.
- Target refs in `point` targets.

## Traceability

- Source: [docs/todos/0007-more-nits.md](../../todos/0007-more-nits.md) all items except the first (Observe row, dropped per user)

## Open questions for the user

1. Step 3: `intent` is optional in the DSL. If a Step has none, crash, show nothing, or fall back to `stepMessage(step)`?
   User Answer: Fall back to `stepMessage(step)`; intent can't be fixed after the fact. Separately verify LLM-compiled draft Recipes require intent (Step 4).
2. Step 3: Non-Step rows have nothing to expand. Keep the toggle on every row (detail area empty/kind-only), or hide it where there is no detail?
   User Answer: Non-Step rows keep an invisible, non-clickable placeholder in the toggle position so the right side (screenshot and toggle columns) lines up all the way down and it's clear which rows toggle.
3. Step 3: When the step id isn't found in the definition (e.g. an in-progress Training Run), show "not found" on the `recipe step:` line, or crash?
   User Answer: Crash. A Step row whose id isn't in the definition is impossible by design.
