# Runner API: init, poll, and Job steps

Reference: [init/+server.ts](../../../../src/hub/src/routes/api/runner/runners/[id]/init/+server.ts), [poll/+server.ts](../../../../src/hub/src/routes/api/runner/runners/[id]/poll/+server.ts), [steps/+server.ts](../../../../src/hub/src/routes/api/runner/runners/[id]/jobs/[jobId]/steps/+server.ts), [runnerActions.ts](../../../../src/hub/src/lib/server/runnerActions.ts), [runnerConfig.ts](../../../../src/hub/src/lib/server/runnerConfig.ts)

Also see: [Runner Config & Startup](../../runner-web/runner-config.md) (the runner-web side), [Job Queue](../job-queue.md) (the claim-atomicity/ownership rules these endpoints wrap).

Notable:
* Auth is one shared secret for every Runner (`requireRunnerSharedSecret()`) — no per-runner credentials yet ([DEFER 2](../../../defers/0002-shared-runner-bearer-secret.md)); a mismatched/missing bearer is always `401`.
* `poll`'s claim (`{ hasWork: true, job: { ..., nextStep } }`) always hands back scripted step 1 — the Runner needs something to perform before its first `steps` call.
* `steps` is the entire report/next-step/terminal loop — there is no separate "complete" call. `403` if the calling Runner isn't the Job's assigned `runner_id`; an already-terminal Job returns its current status unmutated, never revived.
