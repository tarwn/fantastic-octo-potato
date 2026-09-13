# ADR 0001: Playwright for hub e2e tests

**Author:** Agent (Eli Weinstock-Herman)

The hub needs an e2e test runner to verify its basic page renders, living at `src/hub/e2e/*`. The setup todo directs adding Playwright "specifically to run tests in this project." `.claude/hooks/no-npx.js` already carves out `npx playwright ...` as the one allowed bare `npx` invocation, ahead of this spec.

## Decision

We will use Playwright as the e2e test runner for hub, with specs living in `src/hub/e2e/*`.

## Rationale

Playwright is the author's current default choice for browser automation and e2e testing — broad usage and high capability make it a solid default that meets this need without requiring a fresh comparison. Recorded because it's the repo's first e2e test tooling decision and interacts with existing tooling guardrails (`no-npx.js`'s Playwright carve-out). This spec scopes the decision to hub only — CLAUDE.md separately lists Playwright for runner-web and tools, but this spec doesn't wire it up for those scopes.

### Considered Options

* Playwright — author's current default for e2e/browser automation; broad usage and capability, already special-cased in `.claude/hooks/no-npx.js`
* Cypress — common alternative; not the author's default, no reason surfaced to displace Playwright here

## Status

Accepted

## Consequences

- Hub's e2e suite runs on Playwright, wired into a named `npm run` task per this spec's Step 4
- Whether runner-web and tools also adopt Playwright for their own testing (per CLAUDE.md's project configuration) is a separate decision, not made by this spec
