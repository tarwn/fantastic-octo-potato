# Runner HTTP Handling

How runner-web must react to each response/status Hub can return, by call site.

Reference: [pollLoop.ts](../../../src/runner-web/pollLoop.ts) (`runJobLoop`)

Notable:
* Only `init` (startup) treats a failure as fatal (`process.exit(1)`) — every other call site (poll, `reportStep`) logs and continues/falls back to polling, never exits the process.
* A 403/404 from `reportStep` is an expected race (ownership changed, Job gone), not a bug — treat it the same as a network error or a terminal status: log it and abandon the Job loop back to polling.
* A `409` is the same kind of expected race: Hub refused a write because the Job is no longer in the state it required. Discard the result and follow the Job's current status; never retry it or overwrite that status.
* A terminal Job status arriving in a normal `200` body is not an error — it's the expected way a Job loop ends.
