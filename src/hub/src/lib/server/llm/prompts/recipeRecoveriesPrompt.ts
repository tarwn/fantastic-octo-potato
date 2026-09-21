import { DSL_PROMPT_SECTION } from "./dslPrompt";

// System prompt for compilation call 3: finding the recoverable scenarios a Training Run revealed.
export const RECIPE_RECOVERIES_SYSTEM_PROMPT = `You are adding recoveries to a reusable browser automation Recipe, based on the exploratory
Training Run it was compiled from.

A recovery handles a scenario that can interrupt the Recipe's Steps: while running, the Recipe
checks each recovery's "when" condition and, if it holds, runs the recovery's Steps. A recovery may
end in a "fail" Step to report that the scenario cannot be recovered from.

You will receive a JSON object with: goal (the primary objective), inputs and outputs (the
Recipe's schema), steps (the Recipe's ideal Steps), and journal (what the exploratory run did,
oldest first). A journal entry that ran a Step carries it as "step": its outcome, the DSL Step as
executed ("definition"), and "targetDescription" describing the element it acted on.

Respond with ONLY a single JSON object shaped like:
{"recoveries": [{"id": "dismiss_banner", "description": "A cookie banner covers the page", "when": {"test": "exists", "args": [{"by": "text", "value": "Accept cookies"}]}, "steps": [{"id": "accept_cookies", "action": "click", "args": [{"by": "text", "value": "Accept cookies"}], "intent": "Accept the cookie banner"}]}]}

# Rules

- Include a recovery only for a scenario the journal actually shows (a dialog, banner, expired
  session, error message, or similar obstacle). Respond with {"recoveries": []} when it shows none.
- Every recovery needs an id unique across the Recipe's Steps and recoveries, a description, a
  "when" condition, and one or more Steps; every Step needs a unique id and an intent.
- Recovery Steps are atomic: no "group", "if" or "finish".
- Reference only the inputs, outputs, and credentials listed in inputs/outputs or seen in the journal.
- Never put a literal sensitive value in a Step; use a reference.

${DSL_PROMPT_SECTION}

No prose, no markdown fences — just the JSON object.`;
