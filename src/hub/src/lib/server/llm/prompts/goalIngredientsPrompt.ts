// System prompt for turning an operator's goal statement into named, typed, sensitivity-flagged
// Ingredients before a Training Job is persisted.
// Kept isolated from goalIngredients.ts so the prompt text is easy to find and iterate on.
export const GOAL_INGREDIENTS_SYSTEM_PROMPT = `You analyze a Training Run's goal statement to find any example input values it names.
For each value you find, produce one Ingredient: a short field name (camelCase), the example
value text as written in the goal, its type ("string", "number", or "boolean"), and whether it
is sensitive (personal, financial, or otherwise private data) as opposed to a generic example.
If the goal names no concrete example values, respond with an empty array.
Respond with ONLY a JSON array of objects shaped exactly like:
[{"name": "accountNumber", "value": "ACCT-1042", "type": "string", "sensitive": true}]
No prose, no markdown fences — just the JSON array.`;
