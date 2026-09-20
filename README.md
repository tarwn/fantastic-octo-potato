An application that can learn how to navigate an application interface to achieve a goal and turn that into a repeatable, deterministic recipe for completing a task or extracting data on an ongoing basis, with LLM or human intervention to adjust to changing circumstances.

# Background

- [Systems Architecture](./ARCHITECTURE.md)

# Setup

**Prerequisites**

- Node.js 24.x
- Podman or Docker
- _Assumes ports 5173 and 8089 will be free_

**Setup**

- Run `npm install`
- Add Settings
  - Hub: `cp src/hub/.env.example src/hub/.env`
    - LLM: Edit `src/hub.env` and enter an API key, openai-compatible provider, and model name
  - Runner: `cp src/runner-web/.env.example src/runner-web/.env`
  - Target App: _n/a_
- Prepare Database
  - Hub: `npm run db:migrate:up`

**Run the Apps**

- Target App: `npm run dev:target-app:up`
  - _automatically seeds the database_
- Hub: `npm run dev:hub`
  - _automatically seeds the database_
- Runner: `npm run dev:runner-web`
  - _Runner must be started after Hub_

**Try It**

- Go to `http://localhost:5173` (Hub)
- Training Run (requires LLM)
  - Navigate: "Customers" in header -> "Acme" link -> "BambooInvoice" link
  - Tap "Begin a Training Run" to open the run modal:
    - URL: http://localhost:8089
    - Goal: "Find the total of the outstanding invoice for Contoso Consulting"
    - Max Steps: 20
    - tap "Start Training Run"
  - _auto-navigates to the new Job page, runner picks up, watch the Transcript and Outputs fill in_
- Execute a pre-trained Recipe (no LLM required)
  - Navigate: "Customers" in header -> "Acme" link -> "BambooInvoice" link
  - Tap "Start a Job" to open the dialog
  - Select "Broken invoice lookup" or "Read seeded invoice"
  - Enter invoice number "INV-1001" for a real invoice, any other value to test a not found scenario
  - Tap "Start Job"
  - _auto-navigates to the new Job page, runner picks up, watch the Transcript and Outputs fill in_

Masking:
- Values on Job screen and JSON Export of job are masked if sensitive.
- Screenshots for Training or failed Jobs are masked where sensitive data is detected.
- Raw, unmasked values are in the database and lightly partitioned from masked values, waiting for an integration that they will be shipped to or retrieved from, plus an option of encrypting them from the runner with a key hub does not have access to

# Making Changes

This project primarily uses a series of agentic tasks for development.

1. `docs/todos/*` - Add a short write-up of your feature or task in `todos`, numbering is not required but is useful
2. Claude Code
    1. `/write-spec @docs/todos/... [and optional extra instructions]` => produces a numbered folder in `docs/specs/*` with a spec (reviewed) + a plan
    2. `/execute-plan` => finds the first plan file with unchecked tasks and starts working
        - `/make-changes` => called from prior to implement code changes, automatically runs guards, stages a commit, code reviews, fixes, etc.
        - `/multi-persona-review` performs a review, saved to a file (clear direction to prior agent, constrains re-review), stamps a value in `.git` to the commit hash to ensure the agent can't skip reviews
        - `/commit-changes` exists to keep the agent's commits consistent looking, using scoped commit style
    4. `/execute-plan` automatically creates CHANGELOG entries, a PR, etc. when it finishes the last task
        - `/open-pull-request` exists to keep PRs consistent
    5. loop to 2, clear session if you want
3. Profit

## More background

* Architecture Decision Records:
    - [General](./docs/adrs/general/_index.md)
    - [Hub](./docs/adrs/hub/_index.md)
    - [Runner](./docs/adrs/runner-web/_index.md)
    - [Tools](./docs/adrs/tools/_index.md)
* [Deferred Capabilities](./docs/defers/_index.md)
* Reference docs:
    - [general cross-project references](./docs/context/general/_index.md)
    - [hub-specific references](./docs/context/hub/_index.md)
    - [runner-specific topics](./docs/context/runner-web/_index.md)
    - [cross-system integration docs](./docs/context/cross-system-contracts/_index.md)
    - [script references](./docs/context/tools/_index.md)

