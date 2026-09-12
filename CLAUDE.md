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
- `npm run dev:hub` runs the backend and frontend for 

## Code Quality Standards

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
