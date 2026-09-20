# Runner Intervention Loop

How runner-web behaves after a Recipe Job escalates to `Intervention-Requested`, and how that differs from the automatic and training loops.

Reference: [automaticLoop.ts](../../../src/runner-web/orchestrator/automaticLoop.ts) (`waitForIntervention`, `runCommand`, `commandToStep`)

Also see: [Recipe Automatic Loop](./recipe-automatic-loop.md) (where the escalation and the resume happen), [Runner Training Loop](./training-loop.md), [ADR 0005](../../adrs/hub/0005-operator-command-wire-protocol.md) (command wire protocol), [Job Queue](../hub/job-queue.md)

Notable:
* Recipe Jobs only. Unlike the automatic loop, the Runner decides nothing about what runs next: it polls Hub (`RECOVERY_POLL_INTERVAL_MS`) for one operator command at a time and executes it. Unlike the training loop, no LLM is involved on the Runner side and the next Step is not returned by the report call; commands arrive on a separate pull.
* Commands reuse the Recipe Step execution path so allowlist and masking cannot be bypassed; a blocked origin is a `Completed-Error` like any other.
* The browser session stays open for the whole intervention. The intervention timeout restarts as an idle timeout once an operator takes control.
* Hub owns status and ownership, see [Job Queue](../hub/job-queue.md).
* Progression resumes only by hand-back: the Runner reports `Running` and re-enters the automatic loop at the Step id Hub supplies. Ending the Job or idling out reports a terminal status.
