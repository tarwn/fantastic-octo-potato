# Runner API: init & poll

Reference: [init/+server.ts](../../../../src/hub/src/routes/api/runner/runners/[id]/init/+server.ts), [poll/+server.ts](../../../../src/hub/src/routes/api/runner/runners/[id]/poll/+server.ts), [runnerActions.ts](../../../../src/hub/src/lib/server/runnerActions.ts), [runnerConfig.ts](../../../../src/hub/src/lib/server/runnerConfig.ts)

Also see: [Runner Config & Startup](../../runner-web/runner-config.md) (the runner-web side of this contract).

Notable:
* Both routes are action-on-a-single-resource endpoints per [API request/response conventions](./api-request-response-conventions.md): `POST /api/runner/runners/[id]/init` and `POST /api/runner/runners/[id]/poll`.
* Route handlers stay thin — auth check, runner lookup, and heartbeat update all live in `runnerActions.ts` (`runnerInit`/`runnerPoll`) so they're unit-testable without SvelteKit's request/response plumbing.
* Auth: every call must send `Authorization: Bearer <RUNNER_SHARED_SECRET>`; a mismatched or missing header returns `401 { error: "Unauthorized" }`. The secret is a single shared value read via `requireRunnerSharedSecret()` (`runnerConfig.ts`), which throws if `RUNNER_SHARED_SECRET` isn't set — no per-runner credentials yet.
* An unknown/non-numeric `[id]` returns `404 { error: "Runner {id} not found" }`.
* On success, both endpoints call `updateRunnerHeartbeat(db, runner.id, new Date())` before responding — every init and every poll refreshes `last_heartbeat_on`.
* `init` response: `{ data: { pollIntervalSeconds, interventionTimeoutSeconds } }`. Both values come from `runnerConfig.ts` (`getPollIntervalSeconds`/`getInterventionTimeoutSeconds`), a hardcoded default (30s / 300s) overridable via `RUNNER_POLL_INTERVAL_SECONDS`/`RUNNER_INTERVENTION_TIMEOUT_SECONDS` env vars so e2e tests can run the poll loop fast. `interventionTimeoutSeconds` is returned but not yet consumed anywhere.
* `poll` response: `{ data: { hasWork: false } }` — always no work; no job table exists yet.
