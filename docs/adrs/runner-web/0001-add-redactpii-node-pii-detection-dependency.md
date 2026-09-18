# ADR 0001: Add `@redactpii/node` for third-party PII detection in screenshot masking

**Author:** Agent (Eli Weinstock-Herman)

Spec [0008-runner-masking](../../specs/0008-runner-masking/spec.md) (R002) requires screenshots to mask on-screen values the Runner has no advance knowledge of (email, SSN, credit card, phone patterns), per ARCHITECTURE.md's Core Loop → Notable Specifics #2 ("using a third party library to identify sensitive data on the screen"). This is a second, independent pass alongside the known-secrets scrub from Step 1 (C001: it must never replace or gate that pass) and, per the spec's Step 2 guidance, needs to run in Node against page text pulled out via `page.evaluate` — not inside the browser's page context — so it can reuse `screenshotMasking.ts`'s existing per-element overlay-injection mechanism rather than bundling an ML/native dependency into the Runner or the page.

## Decision

We will add `@redactpii/node` (pinned to `1.0.17`) as a production `dependencies` entry in the root `package.json`, and use its `Redactor.hasPII(text)` per-element boolean check inside `screenshotMasking.ts`'s existing element scan, alongside (not instead of) the known-secrets string match already there.

## Rationale

`@redactpii/node`'s `hasPII(text): boolean` API matches exactly how the existing overlay mechanism already tests each element's text/control value against the known-secrets list — no restructuring of the scan loop, just an additional independent predicate per element. It ships true zero runtime dependencies (verified via `npm ls @redactpii/node` after install: no transitive packages), has built-in regex rules for exactly the pattern types the spec calls out (`EMAIL`, `PHONE`, `CREDIT_CARD`, `SSN`), and its `NAME` rule (a noisy greeting-text heuristic not requested by the spec) can be disabled via its `rules` config. It has TypeScript types and dual ESM/CJS builds out of the box, and the highest npm download volume (~194k/month at evaluation time) of the candidates considered, suggesting broader real-world usage than the alternatives.

### Considered Options

* `@redactpii/node` — chosen: zero runtime deps, purpose-built `hasPII()` per-string boolean check fits the existing per-element scan directly, TS types included, configurable rule set matches the spec's named pattern types exactly.
* `openredaction` (user-specified candidate to evaluate) — rejected: its published package depends on `@openredaction/core`, `@openredaction/express`, `@openredaction/react`, and `@openredaction/server` — pulling in Express and React as dependencies of a Node-side regex check makes no sense for `runner-web`'s use case and would bloat the dependency tree for functionality we don't need.
* `@coffeeandfun/remove-pii` — rejected: zero runtime deps like the chosen option, but its API is a `removePII(text)` replace-and-return-string function, not a boolean detector, so using it here would mean discarding a replaced string just to infer a match; it also detects broader categories (street addresses, ZIP codes, dates of birth, generic URLs) than the spec calls for, which risks a higher false-positive rate against ordinary business-app screens (masking legitimate ZIP codes/dates on every screenshot) without an easy way to disable those specific rules.
* A hosted/ML-based PII detection service or model — rejected: spec explicitly calls for a lightweight, pattern/regex-based library running locally in Node; a hosted service would add network dependency and latency to every screenshot, and an ML/native model would be a heavier dependency than the DSL's page-text-only use case needs.

## Status

Accepted

## Consequences

- `runner-web` gains a second production runtime dependency (alongside `playwright`) that must be reviewed for updates independently — it isn't tied to browser version compatibility the way `playwright` is.
- `screenshotMasking.ts` now runs the PII detector against every scanned element's text/control value on every masked screenshot; this is a second, independent regex pass on top of the known-secrets string match already there (unchanged per C001).
- The library's `NAME` rule is disabled by default in our configuration (see Step 2's implementation) since it is a greeting-text heuristic outside the spec's named pattern set — if the spec's PII coverage needs to expand later (e.g. names, addresses), this ADR's configuration is the place to revisit that, not a library swap.
