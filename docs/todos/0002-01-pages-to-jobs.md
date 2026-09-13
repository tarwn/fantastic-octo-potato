Use the [Architecture doc](../../ARCHITECTURE.md) to fill in more of the detail as you plan.

Include `write-adr` and `write-agent-context` where relevant to each of these tasks goals, using context from the architecture doc.

Use `write-defer` when completing a task here that has an explicit, relevant defer in the architecture doc for future-looking behavior for this item.

1. Hub Visuals
   1. Get the Claude Design SCSS and mixins pulled in
   2. Implement the Job Screen from the design mockups, inline with the Architecture doc
   3. Docs
      1. `write-agent-context` for `design-system` for the "hub" area with the minimal set of rules to follow, don't repeat the content in [conventions.md](../context/hub/conventions.md) 
      2. Review and fix any small edits for imported (not linked in _index.md) docs in docs/context/hub
2. Hub Visuals & API & Database
   1. Select the database: 
      1. SQLite should be a good fit (file-based, no heft setup, portable, SQL-based still so we're not building our own drivers and file-based system)
      2. Use dbmate for migrations
      3. Add a folder for migrations + npm commands to up/down to a specified database
      4. Make the database configurable during startup so hub can run a database easily, but automated tests can specify a separate database (also what's the fastest way for playwright to reset this database, is deleting the file and recreating it + running migrations fast or slow if we ran it between every test? Or maybe just add a truncate script next to the migrations folder that truncates all user-defined data without touching any system-defined data from migrations?)
      5. `write-agent-context` for `database-handling` for the "hub" area with these details
   2. Add initial tables:
      1. use all lowercase + underscores case for tables + columns, us `id` locally in a table for it's own `id` and `table-id` for FKs, figure out the FKs below so I don't have to type them
      2. customer: id, name 
      3. application: id, name
      4. customer_application_xref: id, customer_id, application_id
      5. runner: id, customer_application_xref_id, last_heartbeat_on (timestamptz)
      6. recipe_status: id, name
         1. seed this with system data and make it a TypeScript enum with matching values in the app: 1=Draft, 2=Released
      7. recipe: id, customer_application_xref_id, recipe_status_id
         1. recipe will be expanded later once I add the DSL to the architecture doc
   3. Add a script to seed data in the database that will run as part of the server startup (if not exists...)
      1. customer, application, customer_application_xref, runner
   4. Implement other pages (w/ APIs to server) for Customer, Registered Application, and Jobs list with routes and navigation
      1. Jobs list will be empty for now, leave the hard-coded job details pages from the prior step for now
   6. Implemented Start Training modal with planned fields and display of input validation messages.
3. Runner polling
   1. Add logic to the runner to load a hub URL and id (copy it from the seed script above) from a .env file
      1. .env will be gitignored, make a .env.example with these values also to commit, they are not secrets
   2. The runner will start up and make the initial call noted in [Architecture.md] to verify it is allowed to connect and get the API URL to poll for jobs and the intervention timeout
      - Running main loop: poll, claim, validate/acknowledge, receive Hub instructions and return simulated action results during development, report progress/heartbeats, complete/halt, and return to polling.
   3. Hub needs the APIs added to make these calls, use `src/hub/src/routes/api/runner` which will be an endpoint of `/api/runner/*`
   4. Implement a stand-in security shared bearer header value and put it in the .env for both hub and runner
   5. Have the runner enter into a polling loop, assume there will be multiple values for polling loops later, this is the "waiting for jobs poll rate in seconds" value and this can be hardcoded into the first API endpoint in hub that the runner calls
   6. Remember to add a top-level e2e test that stands up both hub and runner to confirm things, in this case the test would be against the runner output to make sure it does the right things at startup via the console output and probably needs to be able to inject a much, much faster poll rate so it's not a long test
   7. Also confirm that the heartbeat is getting updated, some e2e tests local to the hub could verify that when a screen is up that has the runner and it's status that it's one value (idle) when it hasn't connected in a while and another value after calling the init endpoint directly (alive), details should be in architect doc or ask if they aren't, I wrote this down somewhere
4. Implement a local testable target application, my thought was a Dockerfile with MySQL and an app I found: https://www.bambooinvoice.net/
   1. It would need to be able to be self-enclosed but reachable by something running on the host system and may need some data seeded into it, I'm open to alternatives that meet the criteria as long as I don't have to install databases or similar myself (maybe a copy of the old music store from the microsoft examples or something WebForms-based?)
5. Runner main loop and hub job queue
   - Runner's initial call to Hub verifies configured/active identity and receives polling configuration and intervention timeout.
   - Running main loop: poll, claim, validate/acknowledge, receive Hub instructions and return simulated action results during development, report progress/heartbeats, complete/halt, and return to polling.
     - Instructions at this stage are not really implemented, they are pre-filled transcript rows basically so the Runner can run through each "step" and performatively report back what it did and the transcript will look realish
   - Hub atomically assigns the next job that matches this Runner and saves its id, start time, and heartbeat time. Runner API authentication and checks that the Runner is accessing its assigned job are enforced.
   - Hub saves job status, Transcript, Runner activity, and results. Repeated/late reports are handled deliberately; terminal jobs cannot revive and their updated status causes the Runner to exit.
   - Start Training modal creates a real Pending job with goal, URL, allowlist, and maximum steps. Clearly labeled scripted/fake-model mode supplies instructions for development.
   - Working cancellation reaches the Runner and lets it accept subsequent work.
   - Can: Create a job from the modal, watch Pending → Running → terminal and transcript updates, cancel another job, and see the same Runner return to polling. Verify another Runner cannot claim/access the assigned job.
   - All screens should be working at this point, with the exception of:
     - Recipes not available
     - No human intervention overlay yet
     - The Start Trial/Job buttons all inject one of several pre-canned fake jobs per above
     - The Start Training modal is available but can't start a job yet

