// DSL reference (targets, actions, conditions, semantics) shared by the next-Step and Recipe
// compilation prompts, so the vocabulary is written once.
export const DSL_PROMPT_SECTION = `# DSL

## Shape

---
{"id":"push_search","action":"click","args":[{"by":"text","value":"Search"}],"intent":"Push the Search button"}
---

An enumerated action and typed args array avoid parsing instruction strings. IDs are unique across main steps, children, and recoveries. "intent" explains the human task in 1-6 words; optional "irreversible" marks it for review.

## Targets and values

| Target | Example | Playwright |
| --- | --- | --- |
| Text | {"by":"text","value":"Search"} | getByText(value,{exact:true}) |
| Text containing | {"by":"text","value":"Amount:","exact":false} | getByText(value,{exact:false}): case-insensitive substring, still exactly one match |
| Field label | {"by":"label","value":"Account number"} | getByLabel(value,{exact:true}) |
| Placeholder | {"by":"placeholder","value":"Search accounts"} | getByPlaceholder(value,{exact:true}) |
| CSS | {"by":"css","value":"button[name=search]"} | locator(value) |
| Point | {"by":"point","x":240,"y":1180} | Map full-page screenshot coordinates to browser coordinates |

- **Exactly one match:** click, focus, fill, select, scrollIntoView, read; state tests require one match when an element is present.
- **1+ matches:** "exists" is true when any match exists.
- **No matches:** state tests return false; actions/read fail. Multiple matches for a one-element operation are an error.

Point x/y is relative to the full-page screenshot. Points support "click" and "read". For read, the HTML input will be resolved at the point and it's value read.

Values are scalars or {"ref":"input"|"output"|"credential","name":"…"}. Inputs are Ingredients; outputs are collected fields; credentials resolve from a pre-defined set. Destinations are output references. Missing references fail; assigned null is still assigned.

## Actions

[E] = text/label/placeholder/CSS target; [T] = E or point; [S] = string or string reference; [V] = scalar or reference; [D] = output destination; [C] = condition; [Steps] = ordered Step array.

| Action | args | Meaning / Playwright |
| --- | --- | --- |
| open | [S] | Open URL / goto |
| click | [T] | Push a button, follow a link, click a point / click |
| focus | [E] | Focus a field / focus |
| fill | [E,S] | Replace input, textarea, or contenteditable contents / fill |
| select | [E,[{by:"value"|"label",value:S},…]] | Choose native select options / selectOption |
| scrollIntoView | [E] | Bring target into view / scrollIntoViewIfNeeded |
| scroll | [deltaX,deltaY] | Scroll browser viewport / mouse.wheel |
| read | [T,"text"|"value"|"number"|ReadSpec,D] | Copy text/value, parse a number, or extract one regex capture |
| check | [C] | Report boolean answer in transcript |
| verify | [C] | Wait for condition to be true |
| assign | [D,V] | Set/copy an output, including null |
| group | [Steps] | Ordered substeps for one human task |
| if | [[{when:C,steps:Steps},…],elseSteps] | First matching if/elseif, otherwise else |
| goto | [stepId] | Continue at a named Step |
| finish | [C or null] | Confirm completion and validate Recipe outputs |
| fail | [code,message] | Business failure / Completed-Failed |

"fill" is "select this field and type into it," including editable HTML; clearing is fill with "". "text" copies innerText; "value" copies the raw input/textarea/select string. "number" reads a control value when available, otherwise innerText, trims it, and converts the entire string with "Number": empty → null, nonfinite/invalid → failure. No native number-input requirement or partial parsing. A ReadSpec {"source":"text"|"value","extract":{"by":"regex","pattern":"…","group":1|"name"},"parse":"string"|"number"} reads the source, requires exactly one regex match, and returns the selected capture unchanged ("parse" defaults to "string") or, for "number", converted like "number". "exact" is valid only on text targets. Date-like values use text/value unchanged; date types and interpretation are deferred. Results can include the runner timezone as separate metadata, without claiming it is the application's timezone.

## Conditions

{"test":"visible","args":[{"by":"text","value":"Search"}]}

| Test | args | Meaning |
| --- | --- | --- |
| exists | [E] | At least one DOM match |
| visible | [E] | Playwright visibility |
| enabled / disabled | [E] | Element state |
| assigned | [D] | Output has been assigned, including null |
| all | [atomicCondition,…] | Every listed condition is true |
| any | [atomicCondition,…] | At least one listed condition is true |

The search example verifies 'any(visible "No results", visible Open account button)' before branching, so the expected not-found page satisfies the wait too. Both all/any require a nonempty list.

"check", branch guards, and recovery guards observe the current state. "verify" waits, using the Job's single "stepTimeoutMs". Visible does not guarantee enabled or unobstructed; click/fill perform their own actionability checks. Interactability is checked by attempting the action, without a separate test.`;
