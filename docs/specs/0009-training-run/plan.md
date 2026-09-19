This is the plan for [0009-training-run/spec.md](./spec.md).

- [x] 1. E2E guards for a full Training Run
- [x] 2. Hub LLM client
- [x] 3. Goal → Ingredients
- [x] 4. Goal/transcript/screenshot → next Step
- [x] _. Refactor server, a lot
- [x] 5. Runner Training loop
- [x] 6. Recipe compilation
- [x] 7. UI: draft Recipe visibility
- [ ] 8. Docs
- [ ] 9. Revisit allowlist derivation from `startingUrl` (`jobActions.ts`'s `deriveAllowlist`, `new URL(startingUrl).origin`) so a Recipe compiled from a Training run against a test system can be re-pointed at a different origin for Trial/Execute, rather than baking in the Training run's origin
- [ ] 10. `validateRecipeDefinition`'s `checkValueRef` (`recipeDefinitionValidation.ts`) never validates a `{ref:"credential"}` name against any known-credential set (pre-existing, not introduced by Step 4 — Step 4 only fixed this for `validateAtomicStep`/Training's next-Step path). Address once Recipe compilation (Step 6) establishes a source of known credential names for a full Recipe to validate against
