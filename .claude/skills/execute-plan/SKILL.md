---
name: execute-plan
description: Find the latest open plan and begin working on the next open task in the plan.
user-invocable: true
---

# Process

1. Run `node .claude/skills/execute-plan/tools/check-branch.mjs` to verify the current git branch is not `main`.
  - If it exits 1 (prints "Cannot continue, on main branch"), output that message to the user and exit.
  - If it exits 0 (prints "Ready to continue"), proceed to the next step.
2. Run `node .claude/skills/execute-plan/tools/scan-plans.mjs "docs/specs/*/plan.md"` (`<skill-dir>` is this skill's own directory) to get each plan's incomplete/total task count, e.g. `- 6/10 incomplete: C:/blah/blah/blah/plan.md`. Plans live in numbered folders (oldest to newest); the tool lists them in that same order.
3. From the tool's output, select the oldest plan with incomplete tasks as <candidate-plan>.
  - If there are no plans with incomplete tasks, output to the user "Cannot continue, no plans with pending tasks" and exit.
4. Execute the first incomplete task:
  - Use the `make-changes` skill to implement the task with the following prompt:
    > Implement the first unchecked task in <candidate-plan> following the standard process. 
    > Use the linked spec for scope and links to relevant background context and examples.
    > After initial implementation but prior to the commit and mandatory code review step, update the plan file to check the task as complete so it will be marked in the same commit as the changes, prior to code review.
    > <optional: this step introduces an e2e test that is expected to be red at completion until a later task, this is an exception to the standard red/green rules.>
5. After completing that task, if there are incomplete tasks ask the user if they want top continue to the next task
  - if the user indicates to continue: loop back to #4 above for the next task
  - else: this run is complete
6. If all tasks in the plan are complete
  - Run the "Manual, Before PR" guards from CLAUDE.md
  - Update the minor version number in package.json
  - Insert a new CHANGELOG.md entry with the new version number, today's date, and a brief summary of the implemented feature (plan)
  - use `git tag -a "{version number}" -m "{1 line summary of the change}"` to add a tag, and `git push origin --tags`
  - Run the `open-pull-request` skill against `origin/main`
