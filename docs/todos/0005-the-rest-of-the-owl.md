# Step 3: Profit

Use the [Architecture doc](../../ARCHITECTURE.md) to fill in more of the detail as you plan.

Include `write-adr` and `write-agent-context` where relevant to each of these tasks goals, using context from the architecture doc.

Use `write-defer` when completing a task here that has an explicit, relevant defer in the architecture doc for future-looking behavior for this item.


## M5 — Review, Trial, Publish, and replay of the discovered recipe

**Outcome:** A person can go through successful trial, separate human publication, and deterministic execution with new inputs using the Hub screens.

Deliverables:

- Functional review/Start Trial modal shows the particular revision, targets, inputs/outputs, policy, and irreversible steps; acknowledgment and validated ingredients create a real Trial job.
- Successful trial notifies the user and enables Publish for that revision. Failed/interrupted trial cannot qualify as successful. Publish separately changes draft to published.
- Registered Application shows draft/published lists in planned order. Start Job creates a Pending job using the selected/latest published recipe, records the chosen Recipe revision so that later changes do not alter this job, and validates supplied ingredients.
- Trial/Execute share the engine, verify checkpoints, and return outputs and values for expected outcomes such as a missing record, or structured details for business failures, technical errors, and policy violations in Job screen/export.
- Actual training-produced recipe runs successfully with changed inputs and no model decisions during ordinary trial/replay.

**Demonstrate completion:** Review draft → Trial → Publish → Start Job with new input; inspect results/checkpoint. Verify failed trial cannot enable publication as if successful.

## M6 — Human Intervention overlay controls and resumes the live session

**Outcome:** A human recovers a blocked run on the same browser session, with one operator in control and their actions recorded in the Transcript.

Deliverables:

- Real intervention links/states on Customer, Registered Application, Jobs list, and Job screens; Take Control opens the functional overlay.
- Atomic takeover only from Intervention-Requested with no operator owner sets Interactive-User/user id. Automation stops before manual actions are accepted; the same session remains open.
- Overlay shows latest safe screenshot, goal/recipe, stopped step/reason, recent transcript, and current owner.
- Clicking the displayed screenshot acts at the corresponding position in the browser. Hub converts human prompts into DSL actions and validates them against the policy. Direct output assignment checks the value against the declared output type. Refresh observations and record human actions/results in transcript.
- Hub checks the job status and operator id when adding a manual command, using an atomic operation so another status or ownership change cannot occur between the check and adding the command. Reject/handle stale and duplicate commands; cancelled jobs cannot revive from an old overlay.
- Return-control action supplies resume step when needed, clears ownership, validates expected resume state, updates automatic step tracking, and returns Runner to Running/Automatic Loop. If the application is not in the expected state for the selected step, request intervention again.
- Working abort and intervention timeout behavior cleans up and returns to polling. Specify whether/how timeout applies after takeover to avoid discarding an actively controlled session.
- Blocked training and replay both reach manual control; at least one manual recovery resumes to completion with safe evidence.

**Demonstrate completion:** Block a live run, take control, act, and resume to completion without a new session. Exercise coordinate clicks, prompt actions, and output assignment in suitable cases; verify competing takeover/stale command rejection, abort, and timeout cleanup.

## M7 — Exceptional outcomes and recovery demonstrated through the application

**Outcome:** Operators can exercise missing records, recoverable problems, and failures and see deliberate outcomes, recovery with a limit on attempts, clear failures, and human escalation.

Deliverables:

- Executable expected not-found/business-outcome branch returns declared outcome/value and succeeds where intended.
- Known interruption recovery runs deterministically with finite attempts and a check that the application is ready to continue the main steps. Failed-step/recovery ordering does not bypass available recovery.
- Hard failures stop with step, expected/observed state, reason, and a masked screenshot and other useful error details; unhandled problems that a human may be able to fix open the M6 intervention path.
- Screens and JSON exports accurately show status, outcome, outputs, recovery transcript, and details needed to understand the problem.
- Checks covers malformed payloads, policy rejection, checkpoint failure, slow/failed load, duplicate reports, and simultaneous cancellation and control requests against the running Hub, Runner, and Target Application.
- Safe exceptional-state and handoff evidence joins discovery/replay evidence. Missing crash transcripts do not prove an irreversible action did not occur; automatic stale-job retry remains deferred.

**Demonstrate completion:** Reset and run happy path, not-found, automatic recovery with a limit on attempts, hard failure, and manual recovery from Hub. Inspect each result/transcript/export and verify replay makes no model decisions.


## Fin

Fix the gaps. Verify:

- All planned current screens/modals/overlay are verified against available design with real state, complete navigation, refresh, validation, loading/empty/error/terminal states, and corrections found through integrated use.
- Repeatable setup/reset/startup and demo commands/operator steps: genuine training → draft review → Trial → Publish → changed-input Execute → exceptional outcome → live takeover/resume.
- Required guards and relevant browser/manual real-model checks pass. Fixture/fake-model behavior is clearly distinguished from discovery evidence.
- README covers install, keys/config, target reset, startup, guards, and exact demo path. Public architecture and ADR/DEFER records reflect actual behavior/limits.
- All context files, ADRs, DEFERs, etc are consistent with the state we've reached
