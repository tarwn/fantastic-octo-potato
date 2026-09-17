# DEFER 3: Human Intervention producing a revised/improved Recipe

## What?
Using the transcript of a Human Intervention (recovered or timed-out) to automatically produce a revised/improved Recipe is deferred. [ARCHITECTURE.md](../../ARCHITECTURE.md#data-privacy) and [steps-dsl-extended.md](../todos/supporting-docs/steps-dsl-extended.md) both flag it `(FUTURE)`/deferred already; this record ties that to spec 0007 reaching the boundary without building it.

## Why?
Spec [0007-recipe-execution](../specs/0007-recipe-execution/spec.md) reaches and times out of `Intervention-Requested` (R011), but excludes the "Take Control" human-input panel (constraint C005, milestone M6) and any LLM involvement in Trial/Execute (constraint C002; Recipes here are hand-authored per C003). Revising a Recipe from an intervention needs both: Take Control to capture what a human actually did, and Training Mode's LLM-driven Recipe compilation (`0004-01-training.md`) to compile that into a new Recipe. Neither exists yet, so revisit once both do.
