# ADR 0000: Use Nx for task orchestration and caching

**Author:** Agent (Eli Weinstock-Herman)

The repo has 3 project scopes (tools, hub, runner-web) sharing a single root `package.json` (no npm workspaces). Each scope needs guard tasks (lint, type check, tests) and autofix tasks, run frequently by developers, agents, and CI-equivalent hooks (husky). Re-running full lint/typecheck/test suites on every invocation, across all scopes regardless of what changed, wastes time and tokens in agent-driven workflows.

## Decision

We will use Nx to define and cache guard/autofix/build tasks per scope (`project.json` in the repo root, `src/hub/`, and `src/runner-web/`), fronted by `npm run <task>` scripts so npm remains the single, cross-OS task execution surface for humans, skills, and automation.

## Rationale

Nx provides task caching and dependency-aware task graphs without requiring npm workspaces or a monorepo package split, matching the repo's single-`package.json` constraint. The author has hands-on recent experience with both Nx and TurboRepo and picked Nx for this project.

### Considered Options

* Nx — task caching/orchestration without requiring a workspace/package split
* TurboRepo — comparable caching tool, no local experience advantage over Nx for this repo
* No task orchestrator — plain npm scripts per scope, no caching; rejected because repeated full-suite runs during agent-driven iteration are the exact cost this decision avoids

## Status

Accepted

## Consequences

- Guard/autofix commands become cache-aware; unchanged scopes skip re-running tasks
- Adds an nx dependency and `project.json` files as a new piece of tooling contributors must understand
- npm task names must be curated to stay simple and legible (`type[:scope[:variant][:flavor]]`) as nx alone doesn't enforce naming conventions
