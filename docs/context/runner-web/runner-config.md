# Runner Config & Startup

Reference: [config.ts](../../../src/runner-web/config.ts), [index.ts](../../../src/runner-web/index.ts), [.env.example](../../../src/runner-web/.env.example)

Also see: [Runner API: init & poll](../hub/backend/runner-api.md) (the hub side of this contract).

Notable:
* Config is loaded from `process.env` via `loadConfig()` (`config.ts`); each key is fetched through `requireEnv(name)`, which throws (crashes, per repo's "let it crash" rule) if the var is missing rather than falling back to a default.
* Required keys, documented with placeholder values in `.env.example` (gitignored `.env` holds the real values):
    * `HUB_URL` — base URL of the Hub instance to connect to.
    * `RUNNER_ID` — the id of the seeded `runner` row this process authenticates as.
    * `RUNNER_SHARED_SECRET` — bearer secret sent as `Authorization: Bearer <value>` on every Hub call; must match Hub's `RUNNER_SHARED_SECRET`.
* No dependency is used for env loading — Node's built-in `--env-file=src/runner-web/.env` flag populates `process.env` before `index.ts` runs. `dev:runner-web` in `package.json` passes this flag.
* `index.ts` runs the sequence: `loadConfig()` → `initRunner(config)` (`runnerClient.ts`) → `startPollLoop(config, pollIntervalSeconds)` (`pollLoop.ts`).
    * `initRunner` `POST`s to `/api/runner/runners/{runnerId}/init` with the bearer header; on success it returns `{ pollIntervalSeconds, interventionTimeoutSeconds }` from Hub, which are logged. `interventionTimeoutSeconds` is logged only — nothing consumes it yet.
    * On init failure (network error, non-2xx response), `index.ts` logs the error and calls `process.exit(1)` — no retry.
    * `startPollLoop` runs a `setInterval` at the Hub-provided `pollIntervalSeconds`, calling `pollRunner` (`POST /api/runner/runners/{runnerId}/poll`) each tick and logging `hasWork` from the response, or logging (not exiting) on a failed poll.
