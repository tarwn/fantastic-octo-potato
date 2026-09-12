# Spec 0001: Infrastructure Setup

## Goal

A developer (or agent) working in any of the 3 project scopes (tools, hub, runner-web) can run consistently-named, cached `npm run` tasks for linting, type checking, testing, and dev servers, and gets a working SvelteKit hub page and a runner-web entry point to prove the scaffolding works end-to-end.

## Requirements

- R001: nx orchestrates guard/autofix tasks with caching across 3 scopes: root (tools/docs/test-e2e/top-level), `src/hub`, `src/runner-web`
- R002: every task is invoked via `npm run <task>`; npm scripts call nx where an nx task exists for that scope
- R003: npm task names follow `type[:scope[:variant][:flavor]]` (e.g. `test:hub:unit-tests`, `test:hub`, `test:hub:unit-tests:agent`)
- R004: task types are `autofix` (auto-fixable lint/guard), `guard` (tests, linters, type checks, link checker, etc.), and unprefixed "do" tasks (dev server, build)
- R005: single shared `package.json` at repo root; no npm workspaces
- R006: dependencies installed for the already-copied `eslint.config.js`, `tsconfig.json`, `.stylelintrc.json` so they run without missing-package errors
- R007: eslint gets a `guard` and an `autofix` task per scope
- R008: typescript gets a type-check `guard` task per scope
- R009: stylelint gets a `guard` and an `autofix` task, hub scope only
- R010: `tools/guards/check-md-links.cjs` wired as a `guard` task (tools scope + npm task)
- R011: `tools/guards/check-test-file-size.cjs` wired as a `guard` task (tools scope + npm task)
- R012: `eslint.config.js`'s `files: ["scripts/**/*.cjs"]` override is stale (no `scripts/` dir exists) — repoint it at the actual guard/hook script locations under `tools/`
- R013: husky pre-commit hook runs one npm command, `guards:all`, which nx fans out to all `guard` tasks across all 3 scopes
- R014: husky pre-push hook runs `tools/hooks/check-review.cjs`
- R015: `prepare` npm lifecycle script (auto-runs on `npm install`; README's "Run `npm prepare`" covers re-running it by hand) initializes husky and installs Playwright browsers
- R016: hub (`src/hub`) is a SvelteKit app with a basic page
- R017: hub has SCSS support wired in (global `tokens.scss`/mixins content is future work, not this spec — just needs SCSS to compile)
- R018: hub has one test component that consumes SCSS, proving the styling pipeline works
- R019: hub has vitest configured with a test covering that component
- R020: hub has Playwright configured for e2e specs living in `src/hub/e2e/*`, runnable via a named `npm run` task (not a bare `npx playwright` invocation)
- R021: runner-web (`src/runner-web`) has a basic `index.ts` entry point for the runner process
- R022: runner-web has a console logger, initialized when the service starts, that prefixes every logged line with a consistent tag
- R023: runner-web has vitest configured, with a test covering the logger's prefix behavior

## Constraints

- C001: Node.js 24.x (per README prerequisites; matches installed `node -v` 24.9.0)
- C002: guard scripts (`check-md-links.cjs`, `check-test-file-size.cjs`, `check-review.cjs`) already exist as `.cjs` under `tools/guards/` and `tools/hooks/` — keep them `.cjs`, just fix the eslint override glob (R012) rather than rewriting or relocating them
- C003: `.claude/hooks/no-npx.js` blocks any `npx` call except `npx playwright ...` — all other tooling must run through `npm run <task>`
- C004: draft ADRs for the 3rd-party library/framework decisions this spec makes: nx (general scope — task orchestration across all 3 projects), SvelteKit (hub scope), vitest (general scope — used by hub and runner-web), Playwright for hub e2e (hub scope), husky (general scope — repo-wide git hooks)

## Sequencing

Hub is the only piece with user-observable behavior (a rendered page), so it gets an e2e-first step that stays red until Step 2. Step 3 (core lint/type-check conventions) and Step 4 (custom guards, hub e2e task, husky, dev tasks) come after Hub's scaffold exists, since their guards run against real hub source. Runner-web (Step 5) has no user-facing surface, so its guard (vitest) and implementation land together, and gets folded into the Step 3/4 task conventions once it exists. Docs/ADR land last.

---

### Step 1 — Hub e2e guard (red)

**Guard:** new Playwright spec in `src/hub/e2e/` asserting the basic page renders the test component's content; run directly via `npx playwright test` (no nx/npm wiring yet). Expected to fail (component doesn't exist yet) — stays red through Step 2.

**References**
- README.md "Making Changes" section — SvelteKit is the confirmed hub stack
- `.claude/hooks/no-npx.js` — `npx playwright` is the one allowed bare `npx` invocation

**Work:**
- Scaffold SvelteKit app in `src/hub` (default template)
- Add Playwright config for `src/hub/e2e/*`
- Write one e2e spec asserting content that the not-yet-built test component will render

---

### Step 2 — Hub implementation (green)

**Guard:** the Step 1 e2e spec passes; vitest component test passes

**Work:**
- Add SCSS support to the SvelteKit build (no global tokens/mixins file yet — R017)
- Build the basic page and one SCSS-consuming test component matching what Step 1's e2e spec expects
- Configure vitest for `src/hub`; add a component test for the new test component

---

### Step 3 — Nx setup + eslint/typescript/stylelint task conventions

**Guard:** `guard:eslint:*`, `guard:tsc:*` (all 3 scopes) and `guard:stylelint:hub` pass against Step 2's hub source; matching `autofix:*` tasks run cleanly

**References**
- `eslint.config.js`, `tsconfig.json`, `.stylelintrc.json` — pre-copied starter configs, install their deps
- CLAUDE.md "Commands" section — `npm run <task>` is the only execution surface

**Work:**
- Install nx and set up `project.json` in root, `src/hub/`, `src/runner-web/` per the 3-scope split (R001)
- Install missing deps for eslint/tsconfig/stylelint starter configs
- Add `guard`/`autofix` npm+nx tasks per R003/R004 for eslint (all 3 scopes), typescript (all 3 scopes, type-check only, no autofix), stylelint (hub only)

---

### Step 4 — Custom guards, hub e2e task, husky, dev tasks

**Guard:** `npm run guards:all` passes across all 3 scopes (folding in Step 3's tasks plus md-links and test-file-size); husky pre-commit/pre-push fire on a sample commit/push; hub's Step 1 e2e spec now runs via a named `npm run` task

**References**
- `tools/guards/check-md-links.cjs`, `tools/guards/check-test-file-size.cjs`, `tools/hooks/check-review.cjs` — existing scripts to wire in

**Work:**
- Wire `tools/guards/check-md-links.cjs` and `tools/guards/check-test-file-size.cjs` as `guard` npm+nx tasks, tools scope (R010/R011)
- Fix `eslint.config.js`'s `scripts/**/*.cjs` override to match `tools/guards/**/*.cjs` and `tools/hooks/**/*.cjs` (R012)
- Add a named `npm run` task for hub's Playwright e2e suite (R020), replacing Step 1's bare `npx playwright test` invocation
- Add `guards:all` npm/nx task fanning out to every guard task, including the new e2e task
- Add husky pre-commit (`guards:all`) and pre-push (`tools/hooks/check-review.cjs`) hooks
- Add `prepare` npm script: husky install + `playwright install` (R015)
- Add `dev:hub` and `dev:runner-web` "do" tasks

---

### Step 5 — Runner-web scaffold

**Guard:** new vitest test asserting the logger prefixes a logged line consistently; test passes; runner-web's eslint/tsc/vitest tasks fold into the Step 3/4 conventions

**Work:**
- Add `src/runner-web/index.ts` as the process entry point
- Add a console logger initialized at service start; every log line carries the consistent prefix
- Configure vitest for `src/runner-web`, wired into the Step 3/4 task conventions

---

### Step 6 — Docs and ADRs

**Guard:** `check-md-links` guard still passes after edits

**Work:**
- Run `write-agent-context` for topic "npm and nx command conventions"; add it to `docs/context/general/_index.md` (or the most relevant index)
- Move the nx, vitest, and husky draft ADRs from the spec folder into `docs/adrs/general/`, add their rows to `docs/adrs/general/_index.md`
- Move the SvelteKit and Playwright-for-hub-e2e draft ADRs from the spec folder into `docs/adrs/hub/`, add their rows to `docs/adrs/hub/_index.md`
- Update README.md's "Setup"/"Run the Apps" sections to match the single shared `package.json` (no per-project `npm install`) and the `dev:runner-web` task name
- Complete CLAUDE.md's truncated "Build & Run" line and add the `dev:runner-web` task

---

## Out of scope

- The global `tokens.scss`/mixins file and any real design tokens (todo explicitly defers this to a later task)
- Any SvelteKit API routes for runner integration (README mentions this as the eventual hub role, not part of this setup)
- npm workspaces (explicitly deferred by the todo)

## Traceability

- Source: [docs/todos/0001-01-infrastructure.md](../../todos/0001-01-infrastructure.md)

## Open questions for the user

1. Hub framework: CLAUDE.md said Fastify+React, todo/README/eslint config pointed to SvelteKit.
   User Answer: SvelteKit — confirmed. (CLAUDE.md was independently updated to say SvelteKit during spec drafting, so no doc-fix step is needed here.)
