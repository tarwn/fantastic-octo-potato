# DEFER 4: Training-only "masking disable" setting for confirmed synthetic data

## What?
ARCHITECTURE.md's Data Privacy section and `training-run.md`'s `masking, syntheticDataConfirmed?` field describe a Training-only setting that lets an operator explicitly waive both masking passes (known-secrets scrub and third-party PII detection) when the on-screen data is confirmed synthetic, not real. This setting is not implemented.

## Why?
Training Jobs are not implemented yet (see [0004-01-training.md](../todos/0004-01-training.md)), so there is no consumer for this setting today — it only has meaning once a Training Job payload exists to carry `syntheticDataConfirmed`. Deferred out of [0008-runner-masking](../specs/0008-runner-masking/spec.md) (C004), which implements masking for `recipe_job` only. Pick this up as part of building Training Jobs.
