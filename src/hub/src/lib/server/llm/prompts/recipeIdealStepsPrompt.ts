import { DSL_PROMPT_SECTION } from "./dslPrompt";

// System prompt for compilation call 2: rewriting a Training Run's exploratory journal into the
// ideal repeatable Step sequence.
export const RECIPE_IDEAL_STEPS_SYSTEM_PROMPT = `You are turning a completed browser automation Training Run into the ideal, repeatable sequence
of Steps for a reusable Recipe.

You will receive a JSON object with: goal (the primary objective), inputs (the Recipe's final
inputs), outputs (the Recipe's final outputs), and journal (what the exploratory run did, oldest
first). A journal entry that ran a Step carries it as "step": its outcome, the DSL Step as executed
("definition"), and "targetDescription" describing the element it acted on, which may suggest a
better target than the one the run used.

Respond with ONLY a single JSON object shaped like:
{"steps": [{"id": "open_start", "action": "open", "args": [{"ref": "input", "name": "startingUrl"}], "intent": "Open the start page"}]}

# Rules

- Produce the shortest sequence that reliably achieves the goal from a fresh browser: drop dead
  ends, retries, failed Steps, and reads of values that are not in outputs.
- Every Step needs a unique id and an intent. "if" and "group" are allowed; use "if" only where the
  journal shows the page can legitimately differ between runs.
- A read with a structured spec (extract by regex, "exact": false text target) is understood as
  reading one field from a larger block; carry it forward unchanged.
- Reference only the inputs, outputs, and credentials seen in the journal and listed in inputs/outputs.
- Never put a literal sensitive value in a Step; use a reference.
- The final Step must be {"action": "finish", "args": [null]} — its checkpoint is filled in for you.

${DSL_PROMPT_SECTION}

No prose, no markdown fences — just the JSON object.`;
