# Read a value from matched screen text

## Goal

Support deterministic extraction of one field from a larger visible text block. For example, given:

```html
<p>
	Amount: $1200.00<br>
	Sales Tax (6.250%): $75.00<br>
	Total: $0.00<br>
</p>
```

a Recipe must be able to locate the block by its `Amount:` text and publish only `$1200.00`. The current POC cannot express this: text targets are exact, while `read` can only return all text/all control value or parse the entire source as a number.

This work should preserve the existing `"text"`, `"value"`, and `"number"` read forms. Extraction must be explicit and deterministic; the runner must not guess which currency or number in a block is intended.

## Steps DSL additions

Update both [steps-dsl.md](./supporting-docs/steps-dsl.md) and the adjacent [steps-dsl-extended.md](./supporting-docs/steps-dsl-extended.md). The POC document must define the implemented contract. The extended document currently lists substring matching as future vocabulary and discusses typed read options, so move or revise those passages to avoid documenting this feature twice as deferred work.

Two additions are required.

First, permit an optional `exact` flag on text targets:

```json
{"by":"text","value":"Amount:","exact":false}
```

Omitted `exact` remains `true`, preserving current Recipes. `exact:false` maps to Playwright substring matching but retains the POC rule that a one-element operation must resolve exactly one element. If several elements contain `Amount:`, the read fails as ambiguous rather than silently choosing one. Initially limit `exact` to `by:"text"`; do not accidentally expand the contract for label or placeholder targets without a demonstrated use.

Second, allow a structured read specification in the existing second tuple position:

```text
ReadSpec =
  "text"
  | "value"
  | "number"
  | {
      source: "text" | "value",
      extract: {
        by: "regex",
        pattern: string,
        group: number | string
      },
      parse?: "string" | "number"
    }

read = [T, ReadSpec, D]
```

Example Step:

```json
{
  "id": "read_amount",
  "action": "read",
  "args": [
    {"by":"text","value":"Amount:","exact":false},
    {
      "source":"text",
      "extract":{
        "by":"regex",
        "pattern":"(?:^|\\n)Amount:\\s*(?<value>[^\\r\\n]+)",
        "group":"value"
      }
    },
    {"ref":"output","name":"amount"}
  ],
  "intent":"Read the amount"
}
```

This returns the string `$1200.00`. If the declared output should instead be numeric, capture only the numeric portion and set `parse:"number"`; do not silently strip currency symbols, thousands separators, or locale-specific punctuation.

The contract must define these failure cases:

- invalid regular expression → `INVALID_EXTRACTION_PATTERN`;
- no match → `EXTRACTION_NOT_FOUND`;
- more than one match → `EXTRACTION_AMBIGUOUS`;
- missing numbered or named capture → `EXTRACTION_GROUP_NOT_FOUND`;
- `parse:"number"` cannot parse the complete captured value → existing `INVALID_NUMBER` behavior.

Require exactly one regular-expression match even if all matches capture the same value. This follows the existing target-resolution rule and prevents a page change from quietly selecting the wrong field. A named group is preferable in generated Recipes because it is more reviewable, although numbered groups remain useful and easy to support.

Update all contract representations together:

- Hub and runner copies of `TargetElement`, `ReadSpec`, and `ChildStep`;
- Recipe and atomic Training Step validation, including nonempty patterns, a nonnegative integer numbered group, and no unknown object properties;
- contract examples and seeded Recipes that demonstrate the feature;
- any JSON schema or API validation derived from the DSL;
- `StepDescription.svelte` and its tests so the structured form has a human-readable rendering.

Regex execution is configuration-driven code. Set a practical maximum pattern length and source-text length, and evaluate whether the JavaScript runtime needs a safe-regex policy or bounded execution mechanism before accepting arbitrary model-generated patterns. Do not include the source text or extracted sensitive value in failure messages.

## LLM prompt updates

The prompt files under [prompts](../../src/hub/src/lib/server/llm/prompts/) contain copies or summaries of the allowed DSL and must change in the same work as the contract.

Update `nextStepPrompt.ts` to:

- show the structured `ReadSpec` form alongside the three legacy read modes;
- explain that `exact:false` is appropriate when a stable label is contained inside a larger text element;
- instruct the model to anchor extraction to a semantic label such as `Amount:` rather than emit a broad currency/number pattern;
- require exactly one match and one capture group;
- prefer named groups and `parse:"string"` when display formatting such as `$1200.00` must be preserved;
- use `parse:"number"` only when the destination output is numeric and the capture itself is valid for the POC number rules;
- prohibit placing observed values such as `$1200.00` into the pattern, since that would make the Recipe fit only the training example.

Add at least the complete `read_amount` example above. The prompt should explicitly contrast it with `"number"`, which still parses the entire selected element and therefore is not suitable for a multi-value paragraph.

Update `recipeCompilationPrompt.ts` anywhere it describes or permits generated Steps. If compilation continues to carry executed Steps forward verbatim, it still needs enough vocabulary to understand and summarize the structured Step, but it must not rewrite a tested extraction pattern merely to make it look simpler. If compilation is changed to generate a revised Step sequence, require it to retain the successful semantic label, capture rule, output destination, and parse mode unless the observations provide a tested replacement.

Prompt tests should assert that the documented example and rules are present, and LLM validation tests should cover acceptance of a valid structured read plus rejection/correction of malformed extraction specifications.

## Runner implementation outline

The primary implementation is [actions.ts](../../src/runner-web/browser/actions.ts).

1. Resolve the target exactly as other reads do. In `targetResolver.ts`, pass the text target's `exact` value to `getByText`, defaulting to `true`. Missing and ambiguous substring targets keep the existing target errors.
2. Read the raw source. `source:"text"` should use the same visible-text semantics as the existing element text read (`innerText`). `source:"value"` should use the same value-bearing-control rules as the existing value read. Point targets need equivalent handling.
3. Compile the configured pattern. Convert syntax failures into `INVALID_EXTRACTION_PATTERN` without echoing raw page content.
4. find all matches against the raw source and require exactly one. Do not use an implicit first match.
5. Resolve the requested numbered or named capture. A successful overall match with a missing optional capture is still `EXTRACTION_GROUP_NOT_FOUND`.
6. Return the capture unchanged by default. For `parse:"number"`, pass the capture through the existing `parseNumberText` behavior.
7. Call `setOutput` and construct the extraction result exactly as existing reads do, so masking, result storage, and transcript field reporting continue through the established path.

Keep extraction in a small pure helper that can be unit tested independently from Playwright. Tests should cover named and numbered captures, HTML line breaks becoming `innerText` newlines, preservation of `$1200.00`, numeric parsing, no/multiple matches, missing capture, invalid regex, point reads, value reads, and sensitive-value-safe errors. Existing read tests must remain unchanged and passing.

The Hub-side validator in `recipeDefinitionValidation.ts` must reject a structured object that has an invalid source, extraction kind, pattern, group, parse value, or extra property. Runtime validation is still required in the runner because a runner must not trust a dispatched payload solely because the Hub previously accepted it.

## Human-readable UI

The UI should explain the intent of the extraction without exposing an unreadable regex as the primary description.

`StepDescription.svelte` is the shared rendering seam. It is already used in expanded [TranscriptPanel.svelte](../../src/hub/src/routes/jobs/[id]/_components/TranscriptPanel.svelte) details and in Recipe previews such as the flow exercised by [StartRecipeJobModal.test.ts](../../src/hub/src/routes/registered-applications/[id]/_components/StartRecipeJobModal.test.ts). Update it once rather than adding separate formatting logic to both screens.

A useful summary for the example is:

```text
read text containing "Amount:" and capture "value" to output: amount
```

The normal row should continue to prefer the Step's `intent` (`Read the amount`). Expanded detail or a Recipe review can show the structured summary. Avoid displaying the raw regex by default; optionally place it in a technical details disclosure if operators need to audit it.

Add UI tests that use a Recipe containing a structured read:

- `StepDescription.test.ts` renders a meaningful sentence for named and numbered capture groups;
- `TranscriptPanel.test.ts` shows the intent in the collapsed row and the extraction summary in expanded Recipe-step detail;
- `StartRecipeJobModal.test.ts` proves the Recipe preview renders the new Step without crashing and communicates the output field being populated;
- sensitive extracted values continue to use `RedactedValue`; the pattern and semantic label must not bypass existing masking.

No new job-start form field is required: the extraction rule belongs to the Recipe, not to an Ingredient supplied by the operator. The modal needs new logic only insofar as its existing Step preview delegates to the updated Step description.

## Observation and selector suggestions

[targetDescription.ts](../../src/runner-web/browser/targetDescription.ts) currently observes the resolved element before the action and reports one human-readable `{component, selector}`. It prefers id, button caption, element text, linked label, then ancestor label. `actions.ts` assigns that observation in `resolveRequiredLocator`, and the training/automatic loops send it to the Hub for transcript display and later compilation context.

That mechanism cannot describe why `$1200.00` was selected from the paragraph. Worse, for an unlabelled paragraph it will likely choose the entire dynamic paragraph text, truncate it to 50 characters, and report something like `text='Amount: $1200.00 Sales Tax ...'`. That is not a better reusable selector: it embeds changing financial values, may be truncated into an invalid locator suggestion, and says nothing about the capture rule.

Keep target observation and extraction observation separate:

- `targetDescription` answers “which DOM element was acted on?”;
- the Step's structured `ReadSpec` answers “which part of its text was extracted?”;
- the extraction result continues to answer “what value was produced?” and follows existing sensitivity handling.

For a substring-text target, the runner should report the stable requested target (`text contains 'Amount:'`) as the observation when it is safe, rather than replacing it with the paragraph's full observed text. If `describeTarget` finds a genuinely stronger stable identifier such as an element id, it may report that. If the only alternative is dynamic full text, return no selector suggestion (or retain the original substring target) rather than claiming an improvement.

This likely needs the observation contract to distinguish the selector actually used from a suggested replacement, for example:

```json
{
  "component":"element",
  "selector":"text contains 'Amount:'",
  "suggestedSelector":null
}
```

Do not overload `selector` with an extraction regex. If richer observation is added later, an `extractionDescription` such as `capture 'value' after label 'Amount:'` can be derived from the Step definition on the Hub without transmitting the extracted value. Recipe compilation should only replace a target with a suggestion that the runner verified resolves exactly one element; it should carry the tested extraction specification forward independently.

Tests around `targetDescription.ts`, `actions.ts`, both orchestrator loops, runner-client payloads, Hub runner API parsing/storage, and Transcript rendering will need updates if the wire shape changes. Include a regression proving the sample paragraph does not produce a selector suggestion containing `$1200.00`, `$75.00`, or `$0.00`.

## Completion checks

- Existing Recipes using the three string read modes remain valid and behave identically.
- A Training Step can locate the sample paragraph by contained `Amount:` text and extract exactly `$1200.00`.
- Trial and Execute Jobs replay that Step without LLM involvement.
- Invalid, absent, ambiguous, or unsafe extraction instructions fail with specific errors and do not assign an output.
- The next-Step prompt can generate the new form and Recipe compilation preserves it.
- Recipe preview and Transcript detail show a useful nontechnical summary.
- Runner observations never present changing extracted text as a supposedly better selector.
- DSL documents, prompt vocabulary, mirrored types, validation, examples, tests, and UI descriptions agree on one shape.
