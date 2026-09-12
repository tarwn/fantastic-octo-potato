# ADR N: Husky for git hooks

**Author:** Agent (Eli Weinstock-Herman)

The repo needs pre-commit and pre-push enforcement: pre-commit runs `guards:all` across all 3 scopes, pre-push runs `tools/hooks/check-review.cjs` (the code-review staleness/critical-findings gate). The setup todo directs using husky by name for both hooks.

## Decision

We will use husky to manage git hooks, with a `prepare` npm lifecycle script installing them.

## Rationale

The author has vetted husky on another recent project for cross-OS support and good developer experience, and it didn't rise to the level of warranting another comparison round for this repo. Recorded because it's a repo-wide enforcement mechanism (affects every contributor's commit/push flow) referenced elsewhere in the repo (README's "Run `npm prepare` to initialize husky and playwright").

### Considered Options

* Husky — previously vetted by the author for cross-OS support and devx; good enough not to re-evaluate here
* Native git hooks / a custom script — cross-OS support is more manual to get right; not evaluated in depth given husky's prior vetting

## Status

Proposed

## Consequences

- `guards:all` must stay fast enough to run on every commit across all 3 scopes, or contributors will feel friction on every commit
- Hooks are installed via the `prepare` npm lifecycle script, so a fresh `npm install` is sufficient to activate them
