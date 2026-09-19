# DEFER 4: training-run.md's hypothesis-tracking model

## What?
Building [training-run.md](../todos/supporting-docs/training-run.md)'s richer hypothesis-tracking model — a proposed/confirmed/rejected status tracked per field as the LLM discovers it during a Training run — is deferred. Spec [0009-training-run](../specs/0009-training-run/spec.md) reuses the existing `training_job`/`job_step_artifact` tables and the Recipe DSL execution/masking primitives (`executeAction`, `takeMaskedScreenshot`, `validateRecipeDefinition`, `createDraftRecipe`) instead of modeling a separate `training_run` aggregate or per-field hypothesis state (constraint C005).

## Why?
The observed Ingredients, Results, and transcript that 0009 already persists carry the same information a hypothesis-tracking model would — what was tried, what value was used, what happened — without a second aggregate or a richer per-field status machine. Constraint C005 chose to reuse the existing Recipe DSL execution/masking path rather than build a second implementation of it. `training-run.md` otherwise reads as if this richer tracking model is already built; it isn't. Revisit if a future need (e.g. surfacing per-field confidence to an operator mid-run, or reconciling conflicting observations across retries) can't be satisfied by the existing transcript/Ingredient/Result data.
