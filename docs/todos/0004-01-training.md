# Build the training functionality

Use the [Architecture doc](../../ARCHITECTURE.md) to fill in more of the detail as you plan. Also:
- [steps-dsl.md](./supporting-docs/steps-dsl.md)
- [recipe.md](./supporting-docs/recipe.md)
- [examples.json](./supporting-docs/examples.json)
- [training-run.md](./supporting-docs/training-run.md)

Include `write-adr` and `write-agent-context` where relevant to each of these tasks goals, using context from the architecture doc.

Use `write-defer` when completing a task here that has an explicit, relevant defer in the architecture doc for future-looking behavior for this item.


1. Hub LLM Integration
   1. Integration to LLM, use settings from .env, assume OpenAI API scheme, use details from Architecture.md
   2. Enable the modal for training runs
   3. We need a system prompt to examine the user's goal and identify probable input values, provide names, and indicate if they're sensitive or not. If they're sensitive we need to consider when we mask it in the goal input (completion of the job?) and we need to add the inputs to the job with the generated name, value, and sensitivity setting
   4. We need a system prompt and methods that will be used during training, per architecture, as we receive back a screenshot from each training step, using the users goal to direct the LLM on what we want, the minimal DSL to use to tell us what to do next. This needs a validation step when we get the output back to verify it's a valid step nstruction and potential follow-up to have it correct the syntax to match the DSL syntax we want
   5. We need a second prompt and method that will provide a system prompt + instructions, the transcript, the original goal, and ask it to produce a cleaned up version of the steps, identify the inputs necessary and whether they're sensitive, identify the structure for the outputs and whether they're sensitive, plus a validation loop if the response isn't valid
2. Runner: Working Training step loop against the browser with scripted Hub instructions: open entry URL, send safe screenshot/observations and targeting details, obtain/execute the next step, terminate, and clean up.
3. More detail
   - Modal goal/target/policy/step limit govern the run. Explicit model-issued Finished ends training without a discovery checkpoint, preserving final supporting observation. Reaching the maximum number of steps stops processing and fails; blocked/dead-end runs have a real intervention request path.
   - Successful training produces a validated draft Recipe for this Customer/Application from the actual run: ingredients with declared types that can vary between jobs, named output fields without nested objects or arrays, robust targets, completion checkpoints, supported outcomes/recoveries, and a link to the Training Run that produced it; the Recipe is stored separately from the Transcript.
   - Registered Application displays the new draft first with Start Trial; recipe review shows steps, inputs/outputs, and irreversible-action labels. Job screen links the run and resulting recipe.
   - Invalid model responses, compilation failures, and exhausted runs are visible and cannot silently produce a published recipe.
4. Tests/verify: Enter a goal, watch real browser actions/transcript, finish, and inspect the generated draft. Separately reach the step limit or invalid-response handling.
