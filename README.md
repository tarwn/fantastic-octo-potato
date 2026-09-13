An application that can learn how to navigate an application interface to achieve a goal and turn that into a repeatable, deterministic recipe for completing a task or extracting data on an ongoing basis, with LLM or human intervention to adjust to changing circumstances.

# Background

- [Systems Architecture](./ARCHITECTURE.md)

# Setup

**Prerequisites**

- Node.js 24.x
- Run `npm install`
- Run `npm run prepare` to initialize husky and playwright (runs automatically on `npm install`)

**Run the Apps**

- Run the hub web ui: `npm run dev:hub`
- Run the runner: `npm run dev:runner-web`
- Run the sample app: TBD

# Making Changes

This project primarily uses an series of agentic tasks for development.

1. `docs/todos/*` - Add a short write-up of your feature or task to todo's, numbering is not required but is useful
2. Claude Code
    1. `/write-spec @docs/todos/... [and optional extra instructions]` => produces a numbered folder in `docs/specs/*` with a spec (reviewed) + a plan
    2. `/execute-plan` => finds the first plan file with unchecked tasks and starts working
    3. `/make-changes` => called from prior to implement code changes, automatically runs guards, stages a commit, code reviews, fixes, etc.
        - Note: code-review is mandatory, there is a lock mechanism tied to a git hook to require the latest git hash to have been reviewed to hel the agent not bypass things
    4. loop to 2, clear session if you want
    5. `/execute-plan` automatically creates CHANGELOG entries, a PR, etc.


## More detail

* Architecture Decision Records
    - [General](./docs/adrs/general/_index.md)
    - [Hub](./docs/adrs/hub/_index.md)
    - [Runner](./docs/adrs/runner-web/_index.md)
    - [Tools](./docs/adrs/tools/_index.md)
* [Deferred Capabilities](./docs/defers/_index.md)
* Reference docs
    - TBD

