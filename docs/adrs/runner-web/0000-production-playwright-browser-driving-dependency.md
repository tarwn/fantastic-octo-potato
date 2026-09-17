# ADR 0000: Add a production `playwright` dependency for browser driving

**Author:** Agent (Eli Weinstock-Herman)

`runner-web` needs a real Chromium browser/context/page lifecycle to drive the target application against a Recipe's Steps DSL ([steps-dsl.md](../../todos/supporting-docs/steps-dsl.md)) for Trial/Execute Jobs (spec [0007-recipe-execution](../../specs/0007-recipe-execution/spec.md), constraint C007), replacing the previous scripted/simulated step loop. The repo already depends on `@playwright/test` as a devDependency, used only to run Hub's own e2e test suite — that package is a test runner (test fixtures, assertions, `test()`/`expect()`, its own CLI/reporter) and is not intended to be imported as a production dependency of an unrelated service. The repo also has a single root `package.json` shared by all three project scopes (no npm workspaces, see [ADR 0000: Use Nx for task orchestration](../general/0000-use-nx-for-task-orchestration.md)), so any dependency added for `runner-web` lands in that same shared manifest.

## Decision

We will add `playwright` (the underlying browser-automation library, not the `@playwright/test` runner) as a production `dependencies` entry in the root `package.json`, pinned to the same version as the existing `@playwright/test` devDependency (`1.63.0`), and use it directly in `runner-web` (`src/runner-web/browser/browserSession.ts`, `targetResolver.ts`, `actions.ts`, `conditions.ts`, `screenshotMasking.ts`, and `src/runner-web/orchestrator/automaticLoop.ts`) to launch and drive a real Chromium instance.

## Rationale

`playwright` exposes the same underlying browser automation API (`chromium.launch()`, contexts, pages, locators) that `@playwright/test` builds its test-runner scaffolding on top of, without pulling in the test-runner machinery `runner-web` has no use for (test fixtures, `expect`, parallel worker/reporter infrastructure). Keeping both packages pinned to the same version avoids two different Playwright core versions being resolved in the single shared `package.json`.

### Considered Options

* `playwright` as a new production dependency — the underlying automation library, matches exactly what `runner-web` needs (browser/context/page lifecycle, no test-runner scaffolding)
* Import `@playwright/test` directly from production code — rejected: couples a production service to a test framework and its scaffolding, and mixes production and test dependency graphs for no benefit
* A different browser automation library (e.g. Puppeteer) — rejected: would mean maintaining two different browser-automation APIs across the repo, since Hub e2e already uses Playwright's test runner; no advantage over reusing the same underlying library
* Raw CDP (Chrome DevTools Protocol) — rejected: far more low-level, would mean reimplementing selector/wait/lifecycle handling Playwright already provides

## Status

Accepted

## Consequences

- `runner-web` gains a direct, production runtime dependency on `playwright`, alongside the existing `@playwright/test` devDependency already used by Hub e2e — both must be kept at matching versions when either is upgraded, since they share one `package.json`.
- `npm run dev:target-app:up`/browser install steps (the existing `prepare: "husky && playwright install"` script) now provision the browser binary for both test and production use from a single install step.
- No new automation API to learn or maintain beyond what the repo already uses for Hub e2e.
