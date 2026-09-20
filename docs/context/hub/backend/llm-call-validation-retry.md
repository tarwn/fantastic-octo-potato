# LLM Call With Validation Retry

Use this pattern when adding or touching a Hub-side call to the LLM (`src/hub/src/lib/server/llm/`).

Reference: [goalIngredients.ts](../../../../src/hub/src/lib/server/llm/goalIngredients.ts), [nextStep.ts](../../../../src/hub/src/lib/server/llm/nextStep.ts), [recipeCompilation.ts](../../../../src/hub/src/lib/server/llm/recipeCompilation.ts)

Also see: [ADR 0004](../../../adrs/hub/0004-fetch-based-llm-client-no-sdk.md) (why there's no LLM SDK), [0009-training-run spec](../../../specs/0009-training-run/spec.md) (R001, R003, R006, R011)

Notable:
* All three callers share one shape: build a system + user prompt, call `llmClient.ts`'s `sendChatCompletion` (the only function that talks to the LLM — see ADR 0004), then parse/validate the raw text response against a call-specific shape — a plain `Ingredient[]` shape for `goalIngredients.ts`, the atomic DSL Step grammar via `recipeDefinitionValidation.ts`'s `validateAtomicStep` for `nextStep.ts`, or a full `RecipeDefinition` via `validateRecipeDefinition` for `recipeCompilation.ts`.
* On an invalid/malformed response, retry up to `llmConfig.ts`'s `requireLlmConfig().maxCorrectionAttempts` times; once every attempt has failed validation, throw a call-specific `*InvalidResponseError` (never the generic transport/config error `llmClient.ts`/`llmConfig.ts` throw) so the caller can turn *this* failure into its own outcome — a submit-time error (Ingredients), `Completed-Error` (next Step), or a recorded compilation failure that leaves the Job's `Completed-Success` status alone (R007, compilation). No silent fallback — CLAUDE.md's "let it crash" principle applies to a config/transport failure, which is never caught here.
* Every value placed into a prompt (transcript entries, Ingredient values, Result values) must already be the masked/safe projection (the existing `maskValue`/`safeValue` pattern) — never a raw sensitive value (R011). This is the caller's responsibility before building the prompt; none of these three files special-case sensitivity beyond passing through what's already masked.
* Recipe compilation only asks the LLM for the *schema* half (input/output field declarations); the executed Step sequence and finish checkpoint are assembled deterministically from what the run actually observed (`assembleDefinition`), so a compiled Recipe can never invent an untested branch (R006).
