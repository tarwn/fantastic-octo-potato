---
name: multi-persona-review
description: Reviews changes on the current branch (commits since the upstream tracking branch, or since origin/main if none) through four reviewer personas (Conventionalist, Security Auditor, Architect, Optimizer) and reports findings by severity. Use when the user asks for a code review, pre-push review, or "review my changes".
---

Perform a multi-persona code review of the current branch against a **comparison base**. Use a single review pass that applies four reviewer lenses, then report findings grouped by severity by writing a review output using `./templates/code-review.template.md` as a template.

**Re-Review**: If this is a "re-review" request, expect a prior review result (<prior review report>) to be passed in with "action taken" indicated in the report. Only review changes since that prior review, do not re-review the full diff or produce new findings from older changes.

## Tooling

All git interaction for this skill goes through fixed scripts in `tools/`. Never use raw `git` commands for the process, you may run into security blocks.

- `node .claude/skills/multi-persona-review/tools/get-context.mjs` — detects the comparison base (upstream, or `origin/main` if none), fetches it, and prints JSON: `branch`, `headSha`, `base`, `range`, `log`, `stat`, `files`, `reviewedAt`.
- `node .claude/skills/multi-persona-review/tools/diff-files.mjs [path ...]` — prints the diff for the same range, optionally scoped to specific paths. No paths = full diff.
- `node .claude/skills/multi-persona-review/tools/write-summary.mjs --critical N --warning N --suggestion N --missing-context N --files-reviewed N --files-excluded a,b,c` — writes `.git/review_summary.json`. `branch`/`head_sha`/`range`/`reviewed_at` are always recomputed fresh inside the script, not passed in, so they can't be typed or fabricated by the caller.
- `node .claude/skills/multi-persona-review/tools/start-review.mjs <branch>` creates a fresh review file with template values and returns the path to that file.
- `node .claude/skills/multi-persona-review/tools/start-re-review.mjs <path-to-prior-review.md>` creates a re-review file with template values and returns the path to that file.

Use these exact paths below when it says "Run <script-name>.mjs".

## Step 1: Gather review context

1. Run `get-context.mjs`. Its `base` field is the **comparison base** and its `range` field (`<base>...HEAD`) is used everywhere below as `<range>`.
2. Its `files` field is the changed-file list — filter out non-reviewable files before reasoning: lockfiles (`package-lock.json`), generated artifacts, binary assets, snapshots, and `dist/` output. Note any excluded files in your report.
3. Its `stat` field is the diff summary; use it to gauge scope before pulling full diffs.
4. Run `diff-files.mjs` (optionally passing the filtered file list) to get the actual diff content to review.
5. Use the Read tool **selectively** on top of the diff. The diff hunk is usually sufficient. Only open the full file when the change touches a complex architectural boundary — a new/modified exported interface, a class hierarchy change, a new API route, a migration, or auth-related code — where surrounding context is required to judge correctness.

### Early Exit Scenarios

If any of these scenarios are true, skip steps 2-4 and go to step 5, produce a 0/0/0/0 summary.
- **Only Version Bump**: Only CHANGELOG and package.json were modified for a version bump
- **Only Todos**: Only edits to `docs/todos/*` were made

## Step 2: Load relevant standards

Before reviewing, load context that informs the personas:

- Always: root `CLAUDE.md`

Load these index files and only load linked content as it becomes relevant for the changes:
- frontend changes: `docs/context/frontend/index.md`
- backend changes: `docs/context/backend/index.md`
- data structure changes: `docs/context/data/index.md`
- e2e test changes: `docs/context/e2e/index.md`
- math and tax changes: `docs/context/domain-logic/index.md`
- user tooling changes: `docs/context/tooling/index.md`
- docs changes: `docs/context/docs/index.md`

If a change clearly touches a domain or pattern (auth, database, API surface, styling), but no corresponding reference exists, record a `MISSING_CONTEXT` finding rather than guessing.

## Step 3: Review through four personas

Apply each persona to every changed file. A single finding belongs to whichever persona is most relevant — do not duplicate.

### Conventionalist
- Naming, file layout, import order, formatting choices not covered by linter and TypeScript type checks
- Adherence to local idioms from reference files and eslint configurations
- TypeScript usage: explicit types at boundaries, no unjustified `any`
- Test conventions (red/green/refactor, naming, location)
- Comments describe why code is doing what it is doing, now what it is doing.
- Comments do not reference spec files, C###, or R### items, this is wasted characters that do not mean anything to the user and violate the teents for simplicity
- Comments are to be terse and readable

### Security Auditor
- Input validation at API boundaries
- Path traversal / unsafe path construction around `.data/` file reads and writes
- HTML/shell injection, XSS
- Secret handling — flag any token/credential introduced in source
- Logging of sensitive data
- Dependency additions with known risk

### Architect
- Layering: `src/routes` (pages/endpoints) → `src/lib` (shared code) boundaries respected
- Reuse of existing utilities vs. reinvention
- Cross-cutting concerns placed correctly (`$lib`, `styles/`, `scripts/`)
- New abstractions justified by current need (YAGNI per CLAUDE.md)
- Test coverage of new branches; no deleted tests without domain change
- Changes to data read/written in `.data/` preserve backwards compatibility with previously persisted files (no breaking format changes without a migration/fallback path for existing data)

### Optimizer
- N+1 queries, unbounded loops, redundant fetches
- Svelte: unnecessary reactive statements/derived state, over-broad `$:` dependencies, large bundle imports
- Blocking file I/O (e.g. `fs.*Sync`) in request paths (`+page.server.ts`, `+server.ts`) reading/writing `.data/`
- Algorithmic concerns visible in the diff

## Step 4: Assign severity

Every finding gets one of:

- **CRITICAL** — Showstopper. Crash, security breach, data loss, or major standard violation. Must be fixed before merge.
- **WARNING** — Risky or sub-optimal. Should be fixed but not blocking.
- **SUGGESTION** — Nitpick or minor improvement.
- **MISSING_CONTEXT** — Cannot evaluate without a referenced doc, base class, or standard that was not provided. Name the missing artifact.

Be honest about `MISSING_CONTEXT` — do not invent rules.

## Step 5: Report

Produce two outputs:

### 5a. Machine-readable summary (required for pre-push hook)

Run `write-summary.mjs` with the counts from Step 4 and the file totals from Step 1:

```
node .claude/skills/multi-persona-review/tools/write-summary.mjs \
  --critical <n> --warning <n> --suggestion <n> --missing-context <n> \
  --files-reviewed <n> --files-excluded <comma-separated list, no spaces>
```

The script writes `.git/review_summary.json`, computing `branch`, `range`, `head_sha`, and `reviewed_at` itself directly from git at write time — never pass these in or hand-write them, since the pre-push hook uses `head_sha` and `reviewed_at` for staleness checks and can't trust a value that didn't come straight from git.

The pre-push hook reads this file to gate on `counts.critical` and to verify `head_sha` matches the commit being pushed.

### 5b. Markdown report
 
- **First review?** Run `node .claude/skills/multi-persona-review/tools/start-review.mjs <branch>` to create a fresh report file with template values and then fill in this returned file.
- **Re-review?** Run `node .claude/skills/multi-persona-review/tools/start-re-review.mjs <path to prior review.md>` to create a fresh re-reveiw file with template values and then fill in this returned file.

Make sure to:

- Fill in all values in angled brackets
- Ignore bracketed values `<reviewee response>`, leave these in the report

To finish the review, output `Review complete, see results: <path-to-output-file>`

## Constraints

- Do not run any git command directly — use only the three `tools/*.mjs` scripts (see Tooling). This is what lets a user grant this skill git access without granting it broadly.
- Do not modify any files during the review except `.git/review_summary.json` (via `write-summary.mjs`) and the final report — this is otherwise read-only.
- Do not run lint, tests, or builds; the review is about human-judgment concerns the harness cannot catch automatically.
- Keep each finding to a few lines. Prefer specific file:line references over general advice.
- If the diff is empty (e.g. `HEAD` matches `<base>` or there are no commits in range), report that along with the `<base>` used, and stop.
