# Runner Training Loop

How runner-web drives a Training (`training_job`) Job's Steps to a terminal outcome, and why it defers progression to Hub instead of deciding it itself.

Reference: [trainingLoop.ts](../../../src/runner-web/orchestrator/trainingLoop.ts) (`runTrainingJobLoop`, `runOneStep`)

Also see: [Recipe Automatic Loop](./recipe-automatic-loop.md) (the pattern this mirrors, and the point of contrast), [Job Queue](../hub/job-queue.md) (Training's Hub-authoritative progression model), [0009-training-run spec](../../specs/0009-training-run/spec.md) (Step 5, R005, R010, C004)

Notable:
* Shares the Recipe Automatic Loop's shape — `launchBrowserSession`/`closeBrowserSession` for a Job-scoped browser lifecycle (cleanup in a `finally`, on every exit path), `executeAction` to run a Step, `captureAndUploadArtifact` to mask and upload a screenshot — but not its authority model: Training is Hub-authoritative for progression (see [Job Queue](../hub/job-queue.md)). `runOneStep` reports the current Step's outcome and gets the next Step (or `undefined`, meaning Hub has already decided the Job is terminal) back in the *same* `reportDslStep` call — no separate poll/async channel to wait on Hub's LLM latency (C004). The loop is just `while (step) { step = await runOneStep(deps, step) }`.
* The Runner still makes its own Runner-side security/robustness calls directly, mirroring `automaticLoop.ts`'s terminal outcome mapping rather than deferring them to Hub: an allowlist violation or an unexpected technical error from `executeAction` reports `Completed-Error` immediately and ends the loop, without asking Hub for a next Step.
* Training has no upfront Recipe to scan for declared-sensitive inputs the way `recipe_job`'s `collectSecretValues` does — `collectTrainingSecrets` builds the known-secrets set from the Job's sensitive Ingredient values (Step 3's Goal→Ingredients) plus every credential value the Runner has locally.
* `job.syntheticDataConfirmed` (R010) skips the third-party PII-detection pass on screenshots; known-secrets masking always still runs regardless — the same two-independent-passes model as the Recipe loop (see [ADR 0001](../../adrs/runner-web/0001-add-redactpii-node-pii-detection-dependency.md)), not a new masking scheme.
* Training has no `job.comms.artifactsUrl` (Hub sends no `comms` for it) — the artifact-upload URL is computed locally from `config.runnerId`/`job.id` instead, reusing the same upload endpoint the Recipe loop calls through `stepReporting.ts`'s shared helpers.
