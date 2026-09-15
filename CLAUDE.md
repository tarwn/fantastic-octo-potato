# Purpose

An application that can learn how to navigate an application interface to achieve a goal and turn that into a repeatable, deterministic recipe for completing a task or extracting data on an ongoing basis, with LLM or human intervention to adjust to changing circumstances.

## Project Configuration:

There are 3 core projects:

1. Hub, UI, `src/hub/*`: TypeScript, SvelteKit, SCSS
2. Runner-Web, service, `src/runner-web/*`: TypeScript, Playwright
3. Tools, claude tools, automation scripts, multi-service e2e testing: TypeScript, Playwright

## Commands

Be intentional and frugal with commands:
- ALWAYS invoke tasks via `npm run <task>` or you will miss out on optimizations
- Assume you are in the right directory, start commands with `cd` only once you've received an error about your location

### Build & Run

- `npm install` installs for all projects
- `npm run dev:hub` runs the backend and frontend for the hub SvelteKit app
- `npm run dev:runner-web` runs the runner-web entry point

## AutoFix

Run all autofix commands with `npm run autofix` or run individual commands below:

| Command | Fixes | Runs |
|---|---|---|
| `npm run autofix:hub:lint` | ESLint fixable TypeScript/JS formatting issues (hub scope) | manual |
| `npm run autofix:hub:stylelint` | Stylelint fixable SCSS formatting issues | manual |
| `npm run autofix:tools:lint` | ESLint fixable TypeScript/JS formatting issues (tools scope) | manual |

### Guards & Sensors

Use `npm run guard` to quickly run every pre-commit guard across all scopes (nx run-many, so each scope's checks still run/cache independently). Use an individual command to run a specific guard and `--` to pass through arguments.

Every guard below is nx-cached.

| Command | Checks | Runs |
|---|---|---|
| `npm run guard` | every guard below | pre-commit |
| `npm run guard:hub:check` | svelte-check: type errors + Svelte compiler a11y warnings | pre-commit |
| `npm run guard:hub:lint` | ESLint checks (hub scope) | pre-commit |
| `npm run guard:hub:stylelint` | Stylelint checks (hub scope) | pre-commit |
| `npm run guard:hub:test` | vitest unit tests (hub scope) | pre-commit |
| `npm run guard:hub:test-integration` | vitest integration tests (hub scope): real sqlite file, real dbmate migrations, real db:reset between tests | pre-commit |
| `npm run guard:runner-web:lint` | ESLint checks (runner-web scope) | pre-commit |
| `npm run guard:runner-web:test` | vitest unit tests (runner-web scope) | pre-commit |
| `npm run guard:runner-web:tsc` | TypeScript type-check (runner-web scope) | pre-commit |
| `npm run guard:tools:lint` | ESLint checks (tools scope: tools/docs/test-e2e/top-level) | pre-commit |
| `npm run guard:tools:md-links` | markdown link checker (tools scope) | pre-commit |
| `npm run guard:tools:test-file-size` | test file line-count limit (tools scope) | pre-commit |
| `npm run guard:tools:tsc` | TypeScript type-check (tools scope) | pre-commit |
| `npm run guard:hub:e2e` | Playwright E2E | manual, before PR |
| `npm run guard:tools:e2e` | multi-service e2e tests under `test-e2e/` | manual, before PR |

For adhoc manual checks against the running app (e.g. a design-comparison screenshot), use the `verify-ui` skill

### Code Quality Standards

- Always use common language conventions, informed by local eslint and stylelint rules
- Always start with the smallest change that satisfies the goal. YAGNI. Listen to your inner Kent Beck.
- Do not implement beyond what the task's requirement calls for
- Always follow these testing principles
    - 100% test coverage
    - Follow XP principles, prioritize communications, simplicity, clarity, and courage.
    - Never delete tests unless the underlying domain or feature invalidates the test case's intent
- Add comments only when
    1. the information is not obvious from the code
    2. it describes _why_, not _what_
    3. a function or variable name cannot be sufficiently descriptive instead
- No one reads multiline comments
- Let it crash. Do not hide missing configs, expected API values, and other "it should be set but ops it wasn't" values with a fallback to a default value. Crash. Loudly. We want to fix our code, not hide bugs for users to find later after our data has been corrupted.

## Project Structure

```
docs/
    adrs/*              # all ADRs, reference list below
    context/*           # bite-size reference docs, list below
    defers/_index.md    # deferred features and decisions
    specs/*             # specs to develop, point-in-time not evergreen
    todos/*             # ignore this unless specifically linked
src/
    hub/                # SvelteKit website that combines front-end with back-end, including separate API for runner integration
    runner-web/         # node executable that drives browsers
test-e2e/               # multi-system tests
tools/                  # scripts for automation, agents, and more
```

## Reference Content

Reference content indexes for progressive discovery, open only if relevant to the task at hand:

* [general cross-project references](./docs/context/general/_index.md)
* [hub-specific references](./docs/context/hub/_index.md)
* [runner-specific topics](./docs/context/runner-web/_index.md)
* [cross-system integration docs](./docs/context/cross-system-contracts/_index.md)
* [script references](./docs/context/tools/_index.md)

## Architecture Decision Records

Available when looking up the intent behind an architectural decisions that is relevant to the task at hand:

* [Repository-wide decisions](./docs/adrs/general/_index.md)
* [Hub decisions](./docs/adrs/hub/_index.md)
* [Runner decisions](./docs/adrs/runner-web/_index.md)
* [Tool/Script decisions](./docs/adrs/tools/_index.md)
