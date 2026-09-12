---
name: make-changes
description: The steps to properly implement code changes in this codebase.
---

Instructions are provided on the feature, task, or fix to be implemented, generally with a reference to a plan file with the necessary scope and context.

When implementing a task, every step below is required:
    - A task is not complete until step 6 is done
    - Do not start new tasks, concurrently or in parallel, until step 6 is done

# Process:

1. **Prepare**
    - Run `node .claude/skills/make-changes/tools/check-uncommitted.mjs` to check for uncommitted *.ts, *.svelte, or *.scss files.
    - If it exits non-zero (uncommitted files found, printed to stdout): stop, notify the user, ask for next steps.
2. **Develop**: red, green, refactor: 
    - identify tests or new guards/sensors required by the task: write these first
    - verify the new tests are red (fail)
    - make the smallest set of changes to implement the task and make the tests green
    - if there is a pattern to potentially refactor, raise this as a suggestion to the user without implementing it
3. **Guards & Regression**
    - Run "AutoFix" npm tasks before running the guards
    - Run guards via npm tasks in the "Guards & Sensors" table in `CLAUDE.md`
        - Always run the guard npm tasks listed in the task's context before considering it done
        - Always pass the full set of guard tasks and fix noted issues before considering the task done
        - If instructions indicated a new e2e test is expected to be failing until a later step, this is an allowed exception
4. **Preliminary Commit**
    - If using a plan.md file, check off completed task(s) (from `[ ] ...` to `[x] ...`)
    - use skill `commit-change` to make a preliminary git commit
5. **Code Review**: mandatory for all tasks, even "easy" ones
    - In a `change-reviewer` subagent, run the `multi-persona-review` skill, provide the following prompt to the agent:
        ---
        /multi-persona-review for {name or number of the task from the plan file} from [plan file](docs/specs/project-relative-path-to-plan-file.md)

        {optional: indicate if this is a re-review, indicate the fixes that have been applied to the original review}
        ---
    - The reviewer will produce a review report and return the path, referenced later as <review-result>.
    - In the main agent
        - Read the report <review-result>
        - For each finding listed in the report:
            - fix correctable items:
                - All CRITICAL items must be addressed to continue. 
                - All Warnings and Suggestions must be fixed if they are bugs.
                - Fix all simple changes to comments, naming, or to match conventions
                - All remaining Warnings and Suggestions should be triaged and fixed if easy.
                - Never ignore/accept broken findings, they must be fixed in this work or appended to the task list to be fixed before completing the spec.
            - fill in the "Action Taken:" (replace <reviewee response>) field in the report with:
                - "[FIXED]" if you applied a fix above
                - "[LOGGED]" if it was out of scope and you added a future task to the plan to fix it
                - "[SKIPPED]" if you skipped it, followed by a 1 sentence or less explanation
        - Indicate to the user any unaddressed items from the details output above
    - Commit fixes: Amend if this commit hasn't been pushed yet; otherwise create a new [fix] commit
    - Use `/multi-persona-review` skill, request "Re-review the changes from review <review-result>" to limit the follow-up review to the fresh scope only
    - Repeat these review->fix->commit steps until either all review items are addressed or 3 loops are exhausted. 
    - If 3 review loops are exhausted, pause here and ask the user for instructions before continuing
6. **Push Commits**: Push the current branch upstream
