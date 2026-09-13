# Build the training functionality

Use the [Architecture doc](../../ARCHITECTURE.md) to fill in more of the detail as you plan.

Include `write-adr` and `write-agent-context` where relevant to each of these tasks goals, using context from the architecture doc.

Use `write-defer` when completing a task here that has an explicit, relevant defer in the architecture doc for future-looking behavior for this item.


1. Hub LLM Integration
   1. Integration to LLM, use settings from .env, assume OpenAI API scheme, use details from Architecture.md
   2. Enable the modal for training runs
2. Runner: Working Training step loop against the browser with scripted Hub instructions: open entry URL, send safe screenshot/observations and targeting details, obtain/execute the next step, terminate, and clean up.
3. More detail
   - Modal goal/target/policy/step limit govern the run. Explicit model-issued Finished ends training without a discovery checkpoint, preserving final supporting observation. Reaching the maximum number of steps stops processing and fails; blocked/dead-end runs have a real intervention request path.
   - Successful training produces a validated draft Recipe for this Customer/Application from the actual run: ingredients with declared types that can vary between jobs, named output fields without nested objects or arrays, robust targets, completion checkpoints, supported outcomes/recoveries, and a link to the Training Run that produced it; the Recipe is stored separately from the Transcript.
   - Registered Application displays the new draft first with Start Trial; recipe review shows steps, inputs/outputs, and irreversible-action labels. Job screen links the run and resulting recipe.
   - Invalid model responses, compilation failures, and exhausted runs are visible and cannot silently produce a published recipe.
4. Tests/verify: Enter a goal, watch real browser actions/transcript, finish, and inspect the generated draft. Separately reach the step limit or invalid-response handling.
