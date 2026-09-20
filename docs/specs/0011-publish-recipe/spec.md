# Spec 0011: Qualify and Publish a Draft Recipe

## Goal

An operator can publish a draft Recipe once a Trial of that exact Recipe has succeeded, optionally replacing a published Recipe, then run it in an Execute Job with changed inputs. The Hub shows Trial success, publication state, and Job names without log or database inspection.

## Requirements

- R001: A draft Recipe is *qualified* iff a Trial Job (`recipe_job.mode = Trial`) for that Recipe id finished `Completed-Success`. Recipe definitions are immutable, so the Recipe id is the revision; qualification is derived from existing data, not stored.
- R002: Publish takes a trimmed, length-limited Recipe name and an optional published Recipe (same Customer x Application) to replace ("new or replacing" per ARCHITECTURE). Publishing an unqualified or non-draft Recipe is rejected server-side; concurrent publishes of the same draft or replacement of the same Recipe get a 409 (the transaction re-checks statuses).
- R003: Publish is atomic: the draft becomes Published with the name, and the replaced Recipe becomes Archived and linked (`replaces_recipe_id`) to the new one. Start Job offers only Published Recipes (verified against the Hub's list source); Jobs keep their `recipe_id`.
- R004: Registered Application Recipes panel and Recipe review screen show: not-yet-qualified / Trial passed (linking the Trial Job) / Published, and Archived on the review screen only (the panel omits Archived Recipes), plus a Publish action enabled only when qualified. Existing ordering and ingredient validation are unchanged.
- R005: `job.name` is assigned at creation: the Recipe's current name (drafts already have a generated name) for Trial and Execute, "Training Run" for Training. It is shown as the title on the Job screen and next to the job id in the Jobs listing.
- R006: Training → Trial → Publish → Execute with changed ingredients works end to end, with zero LLM calls during Trial and Execute.

## Constraints

- C001: Extend existing Recipe review, Start Trial/Start Job, and `publishRecipe`; no rebuild.
- C002: No sensitive values are added to Hub responses; summary and Job wire types are built from non-raw columns (tested: no `raw*` keys). Names are plain text, escaped on render.
- C003: The migration one-time backfills existing Jobs (`recipe_job` → its Recipe's name, Training → "Training Run"); this is a data backfill, not a runtime fallback.

## Sequencing

Two vertical slices, each green on its own: Job names (Step 1), then qualify/publish (Step 2). Each step writes its e2e guards red first, then makes them pass within the step.

---

### Step 1 — Job names

**Guard:** Integration tests for migration backfill and naming in `createRecipeJob` and training job creation; component tests for Job title and Jobs listing; Hub e2e (`job.spec.ts`, `jobs.spec.ts`) showing the name beside the id.

**References**
- [Job queue](../../context/hub/job-queue.md), [Database handling](../../context/hub/backend/database-handling.md)
- `jobs/recipeJobs/createRecipeJob.ts`, `storage/repositories/jobRepository.ts` (`insertJob`), `routes/jobs/+page.svelte`, `routes/jobs/[id]/+page.svelte`

**Work:**
- Migration: `job.name NOT NULL` with backfill.
- Set `name` at insertion; expose on the Job wire type and JSON export; render as title and in listing.

---

### Step 2 — Qualify and publish

**Guard:**
- Integration: qualification query, atomic publish/replace, rejections (unqualified, already published, cross-application replace, invalid name), 409 races, Start Job list source excludes Archived, summary has no `raw*` keys.
- Unit/component: publish action, RecipesPanel, RecipeReview, new PublishRecipeModal (name defaults to the replaced Recipe's name, replace dropdown, error display).
- Hub e2e: unqualified draft has disabled Publish; qualified draft publishes and replaces; archived Recipe leaves the Start Job list; one happy-path API e2e for the endpoint.
- Multi-service e2e (`test-e2e/`): train → Trial → publish → Execute with changed inputs, asserting the LLM stub receives no calls after training.

**References**
- [Modals](../../context/hub/frontend/modals.md), [Components](../../context/hub/frontend/components.md), [Design system](../../context/hub/design-system.md), [API conventions](../../context/hub/backend/api-request-response-conventions.md), [Hub e2e conventions](../../context/hub/e2e/conventions.md)
- `storage/repositories/recipeRepository.ts` (`publishRecipe`), `recipe/recipeActions.ts`, `RecipesPanel.svelte`, `RecipeReview.svelte` (already marks irreversible steps)
- `test-e2e/training-run.spec.ts`, `test-e2e/recipe-execution.spec.ts`, `test-e2e/llm-stub/client.ts`

**Work:**
- Migration: `recipe_status` Archived (id 3, mirror `RecipeStatus`), `recipe.replaces_recipe_id`.
- Extend `publishRecipe` (name, replaced Recipe, one transaction) and add a qualified-Trial lookup returning the Trial Job id.
- `POST /api/hub/recipes/[id]/publish` `{ name, replacesRecipeId? }`; summaries gain `qualifiedByJobId`, `Archived`, `replacesRecipeId`.
- Publish button + modal on panel and review; state badges; Trial-passed link to the Trial Job. Run `verify-ui`.

---

### Step 3 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- ARCHITECTURE.md: add one sentence to Promote: eligible to publish when a Trial Job of this Recipe completed successfully. No other edits (Archived is already described there).
- Defer (`write-defer`, `docs/defers/_index.md`): the user communication on Trial success (ARCHITECTURE Trial step 4); the Hub shows Trial state instead.
- Update `docs/context/hub/job-queue.md` for `job.name`; add an ADR only if a lasting decision emerged.

---

## Out of scope

- Live Human Intervention, structured failure reporting, final verification/handoff (todo items 2–4).
- User notifications/communications on Trial success (recorded as a defer in Step 3; Hub-visible state only).
- Parent-id "latest published" API selection (ARCHITECTURE FUTURE).
- Recipe editing or irreversible-step review changes.
- Un-archive, unpublish, or renaming a Recipe outside Publish.

## Traceability

- Source: [docs/todos/0005-the-rest-of-the-owl.md](../../todos/0005-the-rest-of-the-owl.md) item #1
