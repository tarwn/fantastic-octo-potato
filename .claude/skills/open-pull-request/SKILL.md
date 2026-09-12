---
name: open-pull-request
description: Opens a GitHub pull request for the current branch against main. Use when the user asks to open, create, or raise a PR.
---

_Assumes the CHANGELOG entry and version bump are already committed and tagged, this skill only covers pushing the branch and opening the PR._

## Process

Assume the "comparison base" is `origin/main` unless the user specifies otherwise.

1. **Prepare**
   Run `node .claude/skills/open-pull-request/tools/prepare-for-pull-request.mjs <comparison-base>`
      - this command ensures the branch is pushed and returns the diff details `branch`, `base`, `range`,
      `clean` (are there uncommitted files in the working tree ), `commits` (hash + oneline summary), and
      `files` touched. If `clean` is `false`, stop and ask the user.
2. **Open the PR.**
   Use the [PR template](./templates/pr.template.md) for the body, and the
   `commits` list from step 1 to summarize into the Summary bullets. Create
   it with:
   - `gh pr create --base main --head <branch> --title "<title>" --body "<templated body>"`

## Keep it terse

Don't restate commit messages verbatim in the Summary — synthesize what
changed and why in a few bullets.

Don't include obvious statements that are part of the standard way of working:
- Don't mention the version bump, it's expected
- Don't mention additional expected tests, only if something critical was uncovered and a test created for it (regression test for a bug, a new gap discovered that hadn't been raised as a bug yet)

