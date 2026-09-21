# Steps DSL: POC vocabulary

POC implementation proposal. Sources: [ARCHITECTURE.md](../../../ARCHITECTURE.md). See the [extended vocabulary](./steps-dsl-extended.md) for expansion checks, [Recipe](./recipe.md), [Training Run](./training-run.md), and [examples](./examples.json).

## Shape

```json
{"id":"push_search","action":"click","args":[{"by":"text","value":"Search"}],"intent":"Push the Search button"}
```

An enumerated action and typed args array avoid parsing instruction strings. IDs are unique across main steps, children, and recoveries. Optional `intent` explains the human task; optional `irreversible` marks it for review. Render the action/args as “Push Search” or “Copy Account number,” leaving locator/wait details to the runner.

## Targets and values

| Target | Example | Playwright |
| --- | --- | --- |
| Text | `{"by":"text","value":"Search"}` | `getByText(value,{exact:true})`; `"exact":false` for substring |
| Field label | `{"by":"label","value":"Account number"}` | `getByLabel(value,{exact:true})` |
| Placeholder | `{"by":"placeholder","value":"Search accounts"}` | `getByPlaceholder(value,{exact:true})` |
| CSS | `{"by":"css","value":"button[name=search]"}` | `locator(value)` |
| Point | `{"by":"point","x":240,"y":1180}` | Map full-page screenshot coordinates to browser coordinates |

A text/label/placeholder/CSS target's `value` is a string or an `input` reference (`{"by":"text","value":{"ref":"input","name":"invoiceNumber"}}`), resolved by the runner at execution; `output` and `credential` references are not allowed in targets, and a sensitive input is masked wherever the target is reported. Text matching is exact unless the text target sets `"exact":false` (Playwright substring: case-insensitive, whitespace-normalized, still exactly one element); `exact` is invalid on label, placeholder, css and point targets. CSS covers button/link identity and editable HTML nodes. These map to [Playwright locators](https://playwright.dev/docs/locators).

- **Exactly one match:** click, focus, fill, select, scrollIntoView, read; state tests require one match when an element is present.
- **1+ matches:** `exists` is true when any match exists.
- **No matches:** state tests return false; actions/read fail. Multiple matches for a one-element operation are an error.

Point x/y is relative to the original full-page screenshot, including content below the scroll, not the viewport or a resized UI preview. The Hub maps preview clicks back to image pixels; the runner maps those pixels to document coordinates and scrolls as needed for clicking or reading. Points support `click` and `read`. For read, resolve the HTML element at the point (use its containing value-bearing control when appropriate). Canvas pixels without an HTML value cannot be read by this POC.

Values are scalars or `{"ref":"input"|"output"|"credential","name":"…"}`. Inputs are Ingredients; outputs are collected fields; credentials resolve only on the runner. Destinations are output references. No `var` namespace or interpolation. Missing references fail; assigned null is still assigned.

## Actions

`E` = text/label/placeholder/CSS target; `T` = E or point; `S` = string or string reference; `V` = scalar or reference; `D` = output destination; `C` = condition; `Steps` = ordered Step array.

| Action | args | Meaning / Playwright |
| --- | --- | --- |
| open | `[S]` | Open URL / goto |
| click | `[T]` | Push a button, follow a link, click a point / click |
| focus | `[E]` | Focus a field / focus |
| fill | `[E,S]` | Replace input, textarea, or contenteditable contents / fill |
| select | `[E,[{by:"value"|"label",value:S},…]]` | Choose native select options / selectOption |
| scrollIntoView | `[E]` | Bring target into view / scrollIntoViewIfNeeded |
| scroll | `[deltaX,deltaY]` | Scroll browser viewport / mouse.wheel |
| read | `[T,"text"|"value"|"number"|ReadSpec,D]` | Copy text/value, parse a number, or extract one regex capture |
| check | `[C]` | Report boolean answer in transcript |
| verify | `[C]` | Wait for condition to be true |
| assign | `[D,V]` | Set/copy an output, including null |
| group | `[Steps]` | Ordered substeps for one human task |
| if | `[[{when:C,steps:Steps},…],elseSteps]` | First matching if/elseif, otherwise else |
| goto | `[stepId]` | Continue at a named Step |
| finish | `[C or null]` | Confirm completion and validate Recipe outputs |
| fail | `[code,message]` | Business failure / Completed-Failed |

`fill` is “select this field and type into it,” including editable HTML; clearing is fill with `""`. `text` copies innerText; `value` copies the raw input/textarea/select string. `number` reads a control value when available, otherwise innerText, trims it, and converts the entire string with `Number`: empty → null, nonfinite/invalid → failure. No native number-input requirement or partial parsing. Date-like values use text/value unchanged; date types and interpretation are deferred. Results can include the runner timezone as separate metadata, without claiming it is the application's timezone. See [Playwright input actions](https://playwright.dev/docs/input).

### Structured read

`read`'s second argument may be a ReadSpec instead of a mode string: `{"source":"text"|"value","extract":{"by":"regex","pattern":"Amount:\\s*(?<value>\\S+)","group":"value"},"parse":"string"|"number"}`. `parse` is optional and defaults to `"string"`.

- `source` selects what is read exactly as the `text` / `value` modes do.
- The pattern has no flags and is length-capped (200 characters), and the runner also caps the source text length. Exceeding either fails rather than truncates.
- Extraction requires exactly one match of the pattern. `group` is a non-negative integer (0 is the whole match) or a group name. The capture is returned unchanged, unless `parse:"number"` converts it as the `number` mode does.
- Failure codes: `INVALID_EXTRACTION_PATTERN`, `EXTRACTION_NOT_FOUND`, `EXTRACTION_AMBIGUOUS`, `EXTRACTION_GROUP_NOT_FOUND`, or `INVALID_NUMBER`. Nothing is assigned on failure, and messages never include page text or the extracted value.

## Conditions

`{"test":"visible","args":[{"by":"text","value":"Search"}]}`

| Test | args | Meaning |
| --- | --- | --- |
| exists | `[E]` | At least one DOM match |
| visible | `[E]` | Playwright visibility |
| enabled / disabled | `[E]` | Element state |
| assigned | `[D]` | Output has been assigned, including null |
| all | `[atomicCondition,…]` | Every listed condition is true |
| any | `[atomicCondition,…]` | At least one listed condition is true |

The search example verifies `any(visible "No results", visible Open account button)` before branching, so the expected not-found page satisfies the wait too. Both all/any require a nonempty list.

`check`, branch guards, and recovery guards observe the current state. `verify` waits, using the Job's single `stepTimeoutMs`. Visible does not guarantee enabled or unobstructed; click/fill perform their own actionability checks. POC interactability is checked by attempting the action, without a separate test. See [Playwright actionability](https://playwright.dev/docs/actionability).

## Children, transcript, and resume

Only one substep level: a top-level group or if contains ordinary Steps; its children cannot contain group/if. Each if case has a Step array, without an extra group wrapper. `all` and `any` contain only atomic conditions. The Hub validates these fixed rules; there are no configurable nesting limits.

Every child reports as a transcript STEP with its own ID, parentStepId, and outcome. A human-task heading may organize those rows, but never replace them. On failure, record the failed child; do not restart the parent or replay completed siblings. Each executable child gets the same default Job step timeout independently.

Human handback accepts any main-program Step ID, including a child. Resume that Step and then its remaining siblings, followed by the next top-level Step. The runner reconstructs the continuation from the child's parent/case; it does not re-evaluate the enclosing if. Outputs remain collected.

`if` normally rejoins at the next top-level Step. A child goto/finish/fail leaves the parent immediately. A goto to a child uses the same continuation rule as handback. POC program jumps are forward alternate paths; looping is deferred. Human handback can explicitly retry an earlier Step.

**Alternative without groups:** keep all executable Steps in one flat array. Let if select a target ID with `[{when,stepId},…]` and an else target ID; use goto to rejoin a common Step. Use intent for human descriptions. This removes child continuation bookkeeping, at the cost of more visible jump rows. The structured if/group form remains the proposal; the extended document demonstrates the flat alternative.

## Recovery and completion

After a Step, check the Recipe's recoverable scenarios and run the matching recovery Steps. Save the interrupted Step/continuation; after recovery, continue at the next Step, or retry the failed Step. If no recovery applies to a failure, or recovery fails, request human intervention. Do not scan for another recovery while already executing one.

Recipe finish requires a checkpoint plus valid declared outputs; Training finish may use null. Invalid DSL or unexpected technical/allowlist errors are Completed-Error; fail is Completed-Failed. Follow terminal Hub status immediately. Training counts executable children toward its maximum Step count; group/if wrappers do not add an extra action count.

Validate action/test enums, tuple types, unique IDs, known references/jump targets, fixed depth, and Ingredients/output fields. Credential values and sensitive diagnostics remain masked. Recovery limits, loop budgets, advanced selectors/conditions, and deeper groups belong to the extended design, not this implementation.
