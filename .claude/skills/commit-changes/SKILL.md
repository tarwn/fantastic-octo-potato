---
name: commit-changes
description: The steps to properly implement code changes in this codebase.
---

Commit message starts with a `{scope}: {subject}` message. Scope is defined by the primary intent/goal of the change:
- `hub` for hub behavior (`src/hub/*`)
- `runner-web` for runner behavior (`src/runner-web/*`)
- `tools` for agent tool scripts, automation scripts, `test-e2e/*` changes without hub/runner changes
- `agent` for changes to skill and agent definitions
- `plan` for changes to docs/specs/* or docs/todos/*
- `docs` for changes to docs files
- if none of those fit, escalate to the user for input (and to update this skill list)

Commit template:
```
{scope}: {subject} ({spec ####}-{task #})

- {top/most notable changes}

Fixes {optional: only include if fixing something that predates this commit}
- Fix {short fix summary}
- Fix {short fix summary}

{agent signature}
```
