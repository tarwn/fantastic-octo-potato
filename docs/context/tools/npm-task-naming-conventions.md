# npm Task Naming Conventions

Use this convention whenever adding or renaming an `npm run` task, so scripts stay predictable and agents can guess a task's name without checking `package.json`.

Reference: [package.json](../../../package.json), [CLAUDE.md "Guards & Sensors"](../../../CLAUDE.md)

Notable:
* Task names follow `type[:scope[:variant]]`, e.g. `guard:hub:lint`.
* `guard` (tests, linters, type checks, link checkers, etc.) and `autofix` (the auto-fixable subset of guard checks) are the two check-style task types. "do" tasks (`dev`, `build`, `preview`, ...) are just more task types under the same `type:scope` pattern — the verb itself is the type, e.g. `dev:hub`, `build:hub`.
* Scopes are the project areas: `tools` (tools/docs/test-e2e/top-level), `hub` (`src/hub`), `runner-web` (`src/runner-web`), and `target-app` (the `target-app/` folder) — a scope gets its own top-level name like `target-app` (rather than folding it into `tools`) when it's a standalone thing used directly by developers, not just by tests under `test-e2e/`.
* Sort/list task names like a directory path — most general segment first, then alphabetically by segment, e.g. `guard`, `guard:hub`, `guard:hub:lint`, `guard:hub:test`, `guard:tools`, `guard:tools:lint`.
* There is exactly one top-level `guard` (every guard, every scope) and one top-level `autofix`. Each scope gets exactly one `guard:<scope>` aggregate, wired as a real nx target (not a shell-chained npm script) so caching/parallelism is preserved. There is no `autofix:<scope>` aggregate — run `autofix` for everything or an individual `autofix:<scope>:<variant>` command.
* Variant names describe the specific check: `lint` (eslint), `tsc` (plain TypeScript type-check), `check` (used instead of `tsc` when a scope already has a richer type-checker that supersedes plain tsc — e.g. hub's `check` is svelte-check, covering TS errors + Svelte a11y warnings), `stylelint`, `test` (unit tests — a guard variant, not its own task type), `e2e` (end-to-end tests, always manual-only, never folded into the `guard` aggregate), `md-links` (markdown link checker), `test-file-size` (test file line-count limit).
* CLAUDE.md's "AutoFix" and "Guards & Sensors" tables are the human/agent-facing index of these tasks — pre-commit rows first, manual rows last, each block sorted per the directory-path rule above.
