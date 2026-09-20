# DEFER 3: Human Intervention producing a revised/improved Recipe

## What?
Using the transcript of a Human Intervention (recovered or timed-out) to automatically produce a revised/improved Recipe is deferred. [ARCHITECTURE.md](../../ARCHITECTURE.md#human-intervention) and [steps-dsl-extended.md](../todos/supporting-docs/steps-dsl-extended.md) both flag it `(FUTURE)`/deferred already.

## Why?
Live Human Intervention now exists (spec [0013-human-intervention](../specs/0013-human-intervention/spec.md)) and records each operator command in the Job Transcript, but operator commands are deliberately not persisted as Recoverable Scenarios. Revising a Recipe from an intervention still needs Training Mode's LLM-driven Recipe compilation (`0004-01-training.md`) to accept an intervention Transcript, plus sensitive-data classification before Transcripts and screenshots go to an LLM. Revisit once that compilation path exists.
