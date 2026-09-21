# Spec 0015: Read Substring Extraction

## Goal

A Recipe can locate a text block by a contained label (`Amount:`) and publish only one field from it (`$1200.00`), deterministically and without LLM involvement on replay. Existing `"text"`, `"value"`, `"number"` reads and exact text targets behave identically.

## Requirements

- R001: Text targets accept optional `exact` (default `true`); `exact:false` is Playwright substring matching (case-insensitive, whitespace-normalized) and still requires exactly one element.
- R002: `read` accepts a structured ReadSpec `{source:"text"|"value", extract:{by:"regex", pattern, group}, parse?:"string"|"number"}` in addition to the three string modes.
- R003: Extraction requires exactly one regex match; the capture is selected by number or name and returned unchanged unless `parse:"number"`, which reuses `parseNumberText`.
- R004: Failures use `INVALID_EXTRACTION_PATTERN`, `EXTRACTION_NOT_FOUND`, `EXTRACTION_AMBIGUOUS`, `EXTRACTION_GROUP_NOT_FOUND`, or the existing `INVALID_NUMBER`; no output is assigned on failure.
- R005: Hub validation (Recipe and atomic Training Step) rejects malformed structured reads; the runner re-validates dispatched Steps itself.
- R006: The next-Step and compilation prompts teach and preserve the structured form.
- R007: `StepDescription.svelte` renders a nontechnical summary (`read text containing "Amount:" and capture "value" to output: amount`); the regex is not shown by default. Transcript and Recipe preview inherit it.
- R008: Observation for a substring text target reports the requested target (`text contains 'Amount:'`), never the element's dynamic full text.

## Constraints

- C001: `exact` is valid only on `by:"text"`; label/placeholder/css targets reject it.
- C002: Patterns have no user flags, a max pattern length, and a max source length (constants, enforced in the runner and Hub validator); exceeding either fails, not truncates.
- C003: Failure messages and observations never contain page text or the extracted value.
- C004: Extraction logic is a pure helper independent of Playwright.
- C005: Hub and runner type copies, validators, prompts, seed/examples and both DSL docs agree on one shape.
- C006: No wire-shape change to the target observation (`{component, selector}`).

## Sequencing

Step 1's e2e tests stay red until Step 3 (`guard:tools:e2e` is manual, so pre-commit is unaffected). Regex safety decision: length caps only, no safe-regex library — patterns are bounded and run once per Step against bounded text; record this in the Step 4 context doc.

---

### Step 1 — Guards for the user-visible behavior

**Guard:** `test-e2e` Training Job (LLM stub) whose read Step targets the invoice paragraph containing `Amount:` with `exact:false` and structured read, extracting exactly the amount; a Recipe replay (Trial/Execute) of the same Step asserting the output and zero LLM calls; an ambiguous-substring failure case.

**References**
- [training-run.spec.ts](../../../test-e2e/training-run.spec.ts), [recipe-execution.spec.ts](../../../test-e2e/recipe-execution.spec.ts), [training-run-helpers.ts](../../../test-e2e/training-run-helpers.ts)
- `target-app/db-init/01-schema-and-seed.sql` (invoice with Amount / Sales Tax / Total)

**Work:**
- Add the specs; confirm they fail for the expected reason.

---

### Step 2 — Contract, validation, docs

**Guard:** `recipeDefinitionValidation.test.ts` cases: valid structured read; rejects bad source, extract kind, empty/over-long pattern, negative/non-integer/empty group, bad parse, extra properties, `exact` on non-text targets, non-boolean `exact`. Existing valid Recipes still pass.

**References**
- [recipeDefinition.ts](../../../src/hub/src/lib/types/recipeDefinition.ts), [recipeDefinitionValidation.ts](../../../src/hub/src/lib/server/recipe/recipeDefinitionValidation.ts), [types.ts](../../../src/runner-web/dsl/types.ts)
- [steps-dsl.md](../../todos/supporting-docs/steps-dsl.md), [steps-dsl-extended.md](../../todos/supporting-docs/steps-dsl-extended.md)

**Work:**
- Add `exact?` to `TargetElement`, `ReadSpec` and the `read` arg in both type copies.
- Extend the validator (shared by atomic Training Step validation); add the limit constants.
- Define the contract and error codes in steps-dsl.md; in steps-dsl-extended.md remove substring matching / typed read options from deferred vocabulary.
- Add a seeded Recipe using the structured read if it fits existing seed conventions.

---

### Step 3 — Runner extraction and observation

**Guard:** unit tests: extraction helper (named/numbered group, `$1200.00` preserved, no/multiple match, missing or unmatched-optional group, invalid regex, over-limit pattern/source, messages free of page text); `actions.test.ts` (text and value sources, point targets, `parse:"number"` incl. `INVALID_NUMBER` message omitting the capture, output not set on failure, HTML `<br>` → newlines via `innerText`); `targetResolver` test (`exact:false` substring is case-insensitive/whitespace-normalized, ambiguous substring); observation regressions: sample paragraph via `exact:false` yields selector `text contains 'Amount:'` and never contains `$1200.00`, `$75.00` or `$0.00`, a target value matching a secret yields an empty selector, exact targets unchanged; existing read tests unchanged. Step 1 e2e goes green.

**References**
- [actions.ts](../../../src/runner-web/browser/actions.ts) (`readElementValue`, `readAtPoint`, `parseNumberText`, `resolveRequiredLocator`), [targetResolver.ts](../../../src/runner-web/browser/targetResolver.ts), [targetDescription.ts](../../../src/runner-web/browser/targetDescription.ts), [errors.ts](../../../src/runner-web/dsl/errors.ts)

**Work:**
- Pure `extractFromText(source, spec)` helper: compile, `matchAll`, require exactly one match, resolve group, return string.
- Wire into `read`: `source:"text"` → `innerText` (points: existing `textContent`); `source:"value"` → existing value rules; then optional `parseNumberText`.
- Runner-side shape validation of the dispatched ReadSpec; add the new error codes.
- `getByText` receives `exact` (default `true`).
- In `resolveRequiredLocator`, for `by:"text"` with `exact:false` report `text contains '<requested value>'` (truncated as today; empty if `redactKnownSecrets` alters it) instead of the identifier chain's full text; keep `component` from the element.
- `INVALID_NUMBER` on this path must not echo the capture.
- Point reads use `textContent` (no `<br>` newlines): document as a known limit rather than change existing point semantics.

---

### Step 4 — Prompts, UI, docs

**Guard:** `nextStepPrompt`/`dslPrompt`/`recipeCompilationPrompt` tests assert the `read_amount` example and rules are present (snapshot updated); `nextStep` validation tests accept a valid structured read and reject/correct malformed specs; `StepDescription.test.ts` (named and numbered group, `exact:false` target); `TranscriptPanel.test.ts` (intent in collapsed row, summary in expanded detail, sensitive value via `RedactedValue`); `StartRecipeJobModal.test.ts` (preview renders the Step and shows the output field).

**References**
- [prompts](../../../src/hub/src/lib/server/llm/prompts/), [StepDescription.svelte](../../../src/hub/src/lib/components/step/StepDescription.svelte), [TranscriptPanel.svelte](../../../src/hub/src/routes/jobs/[id]/_components/TranscriptPanel.svelte)
- [docs/context/hub/_index.md](../../context/hub/_index.md), [docs/context/runner-web/_index.md](../../context/runner-web/_index.md)

**Work:**
- Shared DSL section (`dslPrompt.ts`): structured `ReadSpec` beside legacy modes, `exact` on text targets. `nextStepPrompt.ts`: guidance (`exact:false` for contained labels; anchor to a semantic label; exactly one match and one capture; prefer named groups and `parse:"string"` to keep formatting; `parse:"number"` only for a clean numeric capture; never embed observed values in the pattern), the full `read_amount` example, and the contrast with `"number"`.
- `recipeCompilationPrompt.ts` / ideal-Steps prompt: understand and summarize the structured Step; carry it forward unchanged unless a tested replacement exists.
- `StepDescription.svelte` summary sentence; regex only in an optional technical-details disclosure.
- Update relevant `docs/context/*` (DSL, extraction, regex limits and safety decision) and index entries.

---

## Out of scope

- `suggestedSelector` / `extractionDescription` observation fields and wire-shape changes.
- `exact` on label, placeholder or css targets.
- Regex flags, safe-regex library or bounded-execution mechanism.
- Non-regex extraction kinds, locale-aware number parsing, stripping currency symbols.
- New job-start form fields.

## Traceability

- Source: [docs/todos/0009-read-substring-extraction.md](../../todos/0009-read-substring-extraction.md)
