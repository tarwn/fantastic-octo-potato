# Final project stages

Complete the remaining POC workflow on top of the Training and Recipe execution built in specs 0001–0009.

Use [ARCHITECTURE.md](../../ARCHITECTURE.md) to fill in details while planning. Follow the relevant indexes under `docs/context/`, and use [recipe.md](./supporting-docs/recipe.md), [steps-dsl.md](./supporting-docs/steps-dsl.md), and [examples.json](./supporting-docs/examples.json) when Recipe or DSL details are needed. Do not repeat those documents in the spec.

Create or update ADRs, agent context, and defers for lasting decisions, reusable patterns, and intentionally postponed behavior.

## 1. Qualify and publish a draft Recipe

**Outcome:** An operator can publish a draft after that Recipe revision passes a Trial, then use it in an Execute Job.

Scope:

- Track the immutable Recipe revision used by a Trial. Only a successful Trial qualifies that revision for publication.
- Add the Architecture doc's publish flow: name the Recipe and optionally replace a published Recipe. Replaced Recipes disappear from new Execute Jobs, but remain attached to historical Jobs.
- Show publication eligibility and actions in the existing Recipe review and Registered Application screens. Keep the current ordering and ingredient validation.
- Make Trial success and publication state clear in the Hub without requiring log or database inspection.
- Complete the path from a training-produced Recipe through Trial, publication, and Execute with changed inputs and no model decisions during Trial or Execute.
- Job names are assigned from the Recipe name (Trial, Execute) or explicitly "Training Run" and displayed as the title on the Job screen and in the Jobs listing next to the job id.

Recipe review, Start Trial/Start Job, immutable definitions, deterministic execution, results, screenshots, and export already exist. Extend them rather than rebuilding them.

## 2. Add live Human Intervention

**Outcome:** One operator can take control of a blocked Job, use its current browser session, and safely resume or end it.

Scope:

- Add intervention links and status/ownership to the relevant Customer, Registered Application, Jobs, and Job views. Open the Architecture doc's intervention overlay from the Job view.
- Acquire control atomically and allow only the owner to submit commands or return control. Handle competing takeovers, stale or duplicate commands, cancellation, and status changes without reviving a Job.
- Keep the Runner's current browser session open. Show the latest safe screenshot, the blocked step and reason, recent transcript, desired resume point, and current owner.
- Support coordinate clicks, prompt-to-DSL actions, and direct output assignment. Validate actions and values against existing DSL, policy, and output declarations, and record actions and results in the Transcript.
- Return control at a valid Recipe position and confirm the application is ready. Otherwise, request intervention again.
- Define timeout behavior before and after takeover. Abort, timeout, cancellation, and terminal errors must clean up and return the Runner to polling without silently discarding active control.
- Cover both Training and Recipe Jobs where their authority models differ. Do not add automatic Recipe revision from intervention; that remains deferred.

Build on the existing intervention wait, ownership rules, masking, artifact reporting, and browser cleanup. The spec should add only the wire protocol and persistence needed for interactive commands.

## 3. Complete structured failure reporting

**Outcome:** When a Job fails or errors, the Hub clearly explains what happened.

Scope:

- Carry structured failure details from Runner to Hub: outcome category, step, reason, expected and observed state when available, and the related safe screenshot.
- Show the same masked failure details on the Job screen and in its JSON export, alongside the existing Transcript and Results.
- Keep business failures, technical errors, policy violations, and intervention requests distinct and understandable.

Outcome mapping, bounded recovery, artifacts, masking, and intervention routing already exist. Extend their reporting rather than rebuilding them. Automatic stale-job retry remains out of scope.

## 4. Final verification and handoff

**Outcome:** A human reviewer can set up the POC, exercise every required path, and collect clear evidence of what works.

Scope:

- Verify current screens and overlays against the available design and real state, including navigation, refresh, validation, loading, empty, error, intervention, and terminal states. Fix gaps found during use.
- Provide repeatable setup, reset, startup, and demo instructions for training, review, Trial, publication, changed-input Execute, exceptional outcomes, and live takeover/resume.
- Run the repository guards and relevant browser tests. Clearly distinguish stubbed-model automation from any manual real-model evidence.
- Update README, Architecture, ADRs, defers, context indexes, and changelog so they describe the implemented system and its known limits consistently.

## Completion demonstration

From a clean reset, use the Hub to train, review, Trial, publish, and Execute a Recipe with changed inputs. Also exercise expected not-found handling, bounded recovery, business and technical failures, malformed and duplicate reports, policy and checkpoint failures, cancellation/takeover races, and a manual recovery in the same browser session. Inspect the visible evidence for each outcome and confirm Trial/Execute do not call the model.
