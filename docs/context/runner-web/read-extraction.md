# Read Extraction

A `read` Step can publish one field from a larger text block: target the block with `{"by":"text","value":"Amount:","exact":false}` (substring, case-insensitive, whitespace-normalized, still exactly one element) and pass a ReadSpec instead of `"text"`/`"value"`/`"number"`:

```json
{"source":"text","extract":{"by":"regex","pattern":"Amount:\\s*(?<value>\\S+)","group":"value"},"parse":"string"}
```

- `source:"text"` reads `innerText` (points: `textContent`, so no `<br>` newlines); `source:"value"` follows the existing value rules.
- Extraction is a pure helper (`extractFromText`) independent of Playwright: exactly one regex match, capture selected by number or name, returned unchanged. `parse:"number"` then reuses `parseNumberText`.
- Failures: `INVALID_EXTRACTION_PATTERN`, `EXTRACTION_NOT_FOUND`, `EXTRACTION_AMBIGUOUS`, `EXTRACTION_GROUP_NOT_FOUND`, `INVALID_NUMBER`. Messages and observations never contain page text or the captured value; no output is assigned on failure.
- Observation for a substring text target reports the requested target (`text contains 'Amount:'`), never the element's full text.

## Regex limits and safety decision

Patterns have no flags, a maximum pattern length and a maximum source length (constants enforced by both the runner and the Hub validator); exceeding either fails rather than truncates. The constants are `MAX_EXTRACTION_PATTERN_LENGTH` and `MAX_EXTRACTION_SOURCE_LENGTH` in `src/runner-web/dsl/extraction.ts`, mirrored in Hub's `recipeDefinitionValidation.ts`. There is no safe-regex library or bounded-execution mechanism: patterns are length-capped and run once per Step against bounded text, so that cost is accepted.

## Where it is taught and shown

- The shared DSL prompt section and the next-Step prompt teach the structured form (with the `read_amount` example); the ideal-Steps prompt carries it forward unchanged.
- `StepDescription.svelte` renders `read text containing "Amount:" and capture "value" to output: amount`; the regex appears only in a "technical details" disclosure. Transcript and Recipe preview inherit it.
