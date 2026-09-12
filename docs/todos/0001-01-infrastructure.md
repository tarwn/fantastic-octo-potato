This is the outline of tasks needed for the initial setup of the repo.

Infrastructure:

- Install and setup nx
    - Why NX? Because test/lint caching helps speed up dev and feedback cycles and I've been using both nx and TurboRepo recently and picked on
    - Convention for nx and npm tasks:
        1. npm is the task execution surface that a developer, a skill, and an automated task will reach for the easiest, across OSs. So every task is run from npm, but calls to nx when there is an nx task defined to take advantage of it
        2. 3 scopes of tasks:
            - tools: put the project.json in the top working directory, this covers guard and autofix tasks for .claude, docs, test-e2e, tools, and top-level files
            - hub: src/hub/project.json, this covers guard and autofix tasks for the hub folder
            - runner-web: src/runner-web/project.json, covers guards and autofix for this folder
        3. 3 types of tasks:
            - autofix: any lint or guard task that has an automatic format/fix option, for ex eslint
            - guard: tests, linters, type checks, markdown link checker, etc
            - do things: run a dev server, perform a build
        4. Naming scheme for npm tasks:
            - `type[:scope[:variant][:flavor]]`
            - for example:
                - `test:hub:unit-tests` would be vitest unit tests in the hub folder via nx
                - `test:hub` would be all test tasks nx has for hub
                - `test:hub:unit-tests:agent` would be vitest unit tests in the hub folder via nx with minimal output (saving tokens)
    - use `write-agent-context` for the general topic to condense this down into a single topic "npm and nx command conventions"

- package.json 
    - For now we're going to run with a single shared package.json at the top, deferring a more complicated setup of npm workspaces or similar because it won't add value at this stage

- I've copied over starter configs for eslint.config.js, tsconfig.js, .stylelintrc.json, all the dependencies need to be setup
    - install the necessary bits for all of these
    - add nx + npm commands for each scope and tool above, except stylelint which will only apply to hub
    - eslint should get both a guard and an autofix
    - typescript should get a type check guard on each

- `tools/check-md-links.cjs` is a working script for checking markdown links, this is ready to be added as a guard for tools
    - add a guard to each nx scope for this with npm tasks too
    - decide whether we're going to do cjs or just plain js, the goal is to have commands that can be run simply, cross-OS, via `node <blah>` and not conflict with lint and typescript settings for hub and runner
    - whichever we choose, fix up eslint
- `tools/check-test-file-size.cjs` is a guard that precents test files from exploding in size, copied from another project

- husky pre-commit hook should run a single npm command `guards:all`, nx should map this to run all guards across all 3 scopes, default/no flavor
- husky pre-push should run the check-review.cjs, apply the same decision as check-md-links for cjs/js first

# Hub
- install SvelteKit with a basic page
- add SCSS support, there will be a general tokens.scss file and mixins coming in the next set of tasks 
- add a basic test component that uses SCSS, it will help make sure things are working
- add vitest and a test that can test a single component in the site
- add playwright specifically to run tests in this project, sitting in `src/hub/e2e/*`

# runner-web
- setup a basic index.ts file that will serve as the main runner for the process
- add a console logger that is initialized then the service starts and outputs with a consistent line prefix to the console for logged messages
- setup vitest

Review docs in CLAUDE.md and README.md and incorporate inferred details from those into this setup.
