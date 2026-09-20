import { MAX_RECIPE_NAME_LENGTH } from "../../../recipeName";

// System prompt for compilation call 4: a short readable name for the compiled Recipe.
export const RECIPE_NAME_SYSTEM_PROMPT = `You are naming a reusable browser automation Recipe.

You will receive a JSON object with: goal (the primary objective), inputs and outputs (the
Recipe's schema).

Respond with ONLY a single JSON object shaped like:
{"name": "Get invoice total"}

Rules:
- The name is a short, readable label for what the Recipe does — at most ${MAX_RECIPE_NAME_LENGTH} characters.
- Do not copy the goal verbatim unless it is already short; never include a sensitive value.

No prose, no markdown fences — just the JSON object.`;
