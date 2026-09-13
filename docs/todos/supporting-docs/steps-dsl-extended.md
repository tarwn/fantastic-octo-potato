# Steps DSL: extended vocabulary and expansion checks

Directional design, not an implementation backlog. The [POC vocabulary](./steps-dsl.md) defines the current implementation scope. Expansion keeps `{id,action,args,intent?,irreversible?}`, `{by,…}` targets, `{test,args}` conditions, and explicit named references. Implementations validate their supported vocabulary rather than accepting every possible extension.

Sources: [ARCHITECTURE.md](../../../ARCHITECTURE.md), then code-example.js (not available).

## Additional targets and references

| Addition | Shape | Adapter / expansion check |
| --- | --- | --- |
| Accessible role | `{by:"role",role:"button",name:"Search"}` | getByRole; distinguishes a button from a link with the same text |
| Alternative text | `{by:"alt",value:"Company logo"}` | getByAltText |
| Title | `{by:"title",value:"Help"}` | getByTitle |
| Test ID | `{by:"testId",value:"balance"}` | getByTestId |
| XPath | `{by:"xpath",value:"//input[@name='account']"}` | locator with explicit XPath |
| Substring matching | `{by:"text",value:"Search",exact:false}` | Optional exact flag on text-like targets |
| Scoped target | `{by:"text",value:"Edit",within:{by:"css",value:"#account-panel"}}` | Scope before matching |
| Match index | `{by:"text",value:"Edit",nth:0}` | Explicit zero-based selection |
| Frames | `{by:"css",value:"#balance",frames:["iframe#legacy"]}` | Explicit frame path, outermost first |
| Working value | `{ref:"var",name:"summary"}` | Run-local temporary state, excluded from final outputs |

These add target variants/optional fields without changing action tuple boundaries. Standard CSS and portable semantics should remain separate from Playwright-specific locator extensions. XPath cannot cross shadow roots. Selenium or another runner translates the same target objects to its own matching APIs. See [Playwright locators](https://playwright.dev/docs/locators).

Point remains a coordinate on the captured full-page image, including scrollable content, and continues to support read. A future capture contract can explicitly record image scale, scroll offsets, and capture mode. Freshness checks and coordinate rebinding across layout changes belong here until required; they must not silently reinterpret a point as a different semantic target. The runner can report better selectors during training, and compilation can choose them for a reviewed Recipe. Canvas/OCR extraction would need its own capability; DOM point-read does not imply OCR.

## Additional actions

| Action | args | Human task / adapter |
| --- | --- | --- |
| doubleClick | `[target]` | Double click / dblclick |
| hover | `[target]` | Move over target / hover |
| type | `[element,string]` | Append with per-character keyboard events / pressSequentially |
| press | `[element or null,key]` | Enter, Tab, Escape, or modifier chord / press |
| setChecked | `[element,boolean]` | Set checkbox/radio state / setChecked |
| read to working state | `[target,mode,{ref:"var",name:"summary"}]` | Reuse extraction without publishing it |
| check to working state | `[condition,{ref:"var",name:"canSave"}]` | Preserve boolean for later comparisons |

Adding check's destination changes that action's arity; introduce it through an explicit schema version/profile rather than guessing optional positions. Existing POC check still reports a boolean in the transcript. `fill` remains the default human “type into” task; `type` handles the narrower append/event case. See [Playwright input actions](https://playwright.dev/docs/input).

Numeric parsing may eventually require explicit locale, currency, grouping, rounding, and null/error rules. Add typed options to read rather than guessing from arbitrary page text. Date conversion needs declared source format, timezone provenance, daylight-saving/ambiguity rules, and desired output representation. Raw strings plus runnerTimezone metadata in the POC are not a date system; a native HTML date input does not solve that design.

## Additional conditions

| Test | args | Meaning |
| --- | --- | --- |
| onScreen | `[element]` | Visible and intersects viewport |
| editable / checked | `[element]` | Corresponding state |
| interactable | `[element,"click" or "fill"]` | Ready for that specific operation, without performing it |
| textEquals / textContains | `[element,string]` | Explicit text comparison |
| valueEquals | `[element,string]` | Raw control-value comparison |
| equals | `[value,value]` | Strict scalar comparison |
| not | `[condition]` | Negation |

Flat all/any are part of the POC. Nested all/any/not can be allowed later without changing the condition object's shape. Keep missing/ambiguous elements distinct from invalid selectors and browser errors. A false condition is not a technical-error handler.

Visible, within viewport, enabled, and unobstructed are different questions. A click-readiness probe needs stability, event reception, and enabled state; a fill-readiness probe needs editable state. Preserve page state while probing, and let the eventual action repeat its checks. See [Playwright actionability](https://playwright.dev/docs/actionability).

POC substitutes cover the original scenarios: text/label/CSS for button/link identity; click/fill's own checks for interactability/editability; text/value reads for all date-like controls. These do not claim the extended distinctions already exist.

## Branch expansion and the flat alternative

The structured POC supports ordered cases and a flat child array per case. For example:

```json
{"id":"choose","action":"if","args":[
  [
    {"when":{"test":"visible","args":[{"by":"text","value":"No results"}]},
     "steps":[{"id":"mark_missing","action":"assign","args":[{"ref":"output","name":"status"},"not_found"]}]},
    {"when":{"test":"enabled","args":[{"by":"css","value":"button[name=open]"}]},
     "steps":[{"id":"push_open","action":"click","args":[{"by":"css","value":"button[name=open]"}]}]}
  ],
  [{"id":"unknown","action":"fail","args":["UNKNOWN_RESULT","No recognized outcome"]}]
]}
```

Later, those child arrays could contain groups/ifs. That would require deeper continuation tracking, but not a new expression parser. Every executable descendant must still be a transcript Step and a possible human resume target.

A flat alternative stores every executable Step at the top level and changes if to choose target IDs:

```json
[
  {"id":"choose","action":"if","args":[
    [{"when":{"test":"visible","args":[{"by":"text","value":"No results"}]},"stepId":"missing"}],
    "found"
  ]},
  {"id":"missing","action":"assign","args":[{"ref":"output","name":"status"},"not_found"]},
  {"id":"missing_done","action":"goto","args":["complete"]},
  {"id":"found","action":"read","args":[{"by":"label","value":"Account number"},"value",{"ref":"output","name":"accountNumber"}]},
  {"id":"found_done","action":"assign","args":[{"ref":"output","name":"status"},"found"]},
  {"id":"complete","action":"finish","args":[{"test":"assigned","args":[{"ref":"output","name":"status"}]}]}
]
```

This is an alternative if schema, not valid POC JSON. It eliminates nested continuation paths: intervention resumes directly at found or missing_done. Structured if provides a more natural human “if this, do these things”; flat targets provide a simpler execution list. Both use typed cases and named goto targets. Avoid supporting both forms in the POC.

A group title must never collapse child execution history into one indistinguishable outcome. A partial group stays partial. Deeper grouping must preserve the selected branch and remaining siblings when resuming, rather than running its guard again. Groups are ordered tasks, not parallel transactions; automatic rollback is a separate design.

## Deferred operational ideas

| Idea | Why defer / design seam |
| --- | --- |
| maxUses per recovery | Useful for recurring/flaky popups; add a recovery field when needed |
| Retry/skip policy | Useful for recovery that deliberately replaces a failed action; explicit policy instead of guessing |
| Recovery priorities or chaining | Only needed when several scenarios overlap; avoid recursive recovery execution |
| Backward goto and loop budgets | POC uses forward alternate paths; loops need job-level bounds |
| Deeper groups/conditions | POC depth is fixed at one; deeper trees need explicit resume paths and Hub limits |
| Separate probe deadlines | POC has one Job step timeout; separate knobs only with evidence they are needed |
| Total instruction/action budgets | Useful beyond the Training cap, especially loops and repeated intervention |
| Capture freshness/rebinding | Useful for delayed screenshot clicks or reusable point Recipes |
| Richer output/date/table schemas | Architecture defers nested and tabular outputs; requires more than extra primitive type names |
| Retention and result projections | Storage/authorization work, not DSL actions |
| Intervention → revised Recipe | Deferred by architecture; learn from the full child transcript when implemented |

No content digests or duplicated trial eligibility records are proposed. Database logic protects immutable Recipe definition fields; lifecycle updates and a Trial-Job query handle publication for the POC.

These are seams to extract later if useful, not requirements for implementing the POC.
