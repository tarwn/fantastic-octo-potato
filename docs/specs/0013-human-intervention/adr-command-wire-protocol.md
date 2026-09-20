# ADR (draft): Operator command wire protocol for live Human Intervention

**Author:** Agent (Eli Weinstock-Herman)

While a Recipe Job is `Interactive-User`, the owner sends commands (click now; assign and prompt later) that the Runner must execute in its still-open browser session. The Runner has no inbound channel (it pulls from the Hub by polling), commands can carry operator-typed values that must never appear in Job responses, and a Job can leave `Interactive-User` (cancel, end, timeout) while a command is in flight. This draft moves to `docs/adrs/hub/` in the last step of the spec.

## Decision

The Hub persists at most one pending command per Job in `intervention_command`, and the Runner pulls it:

- **Submit** (`POST /api/hub/jobs/:id/commands`): validated by the Hub, then inserted in one transaction that re-checks status (`Interactive-User`) and owner. A second submit while one is `Pending` gets a 409.
- **Idempotency**: each submission carries a client `commandKey`, unique per Job. A duplicate returns the original command rather than creating another.
- **Pull** (`GET .../runners/:id/jobs/:jobId/commands/pending`): the only endpoint that returns `raw_payload`, and only while the Job is `Interactive-User`. The Runner reads it at its existing in-Job poll cadence.
- **Result** (`POST .../commands/:commandId/result`): accepted once, only for a `Pending` command on a Job that is still `Interactive-User`; it writes the command's Transcript Step entry through the ordinary DSL Step report path. Otherwise 409, and the Runner discards the result and follows the Job's new status.
- **Void**: any status write that leaves `Interactive-User` marks `Pending` commands `Voided`, so a command is never served or accepted after the Job moved on.
- The command's Step id is derived by the Hub (`intervention-<commandId>`), which is how the overlay finds that command's Transcript entry and screenshot.

## Rationale

A single pending command with a pull model needs no queue semantics, ordering rules or push channel, and makes "void on status change" one UPDATE. Keeping `raw_payload` and `safe_payload` in separate columns makes the masking boundary a column choice instead of a filter to remember. Deciding ownership and status in the same transaction as the write closes the race between a cancel and a submit.

### Considered Options

* Single pending command, Runner pull (chosen): simplest fit for the polling model and the void rule
* Command queue: allows batching, but the overlay is blocked until each result returns, so a queue buys nothing and adds ordering and partial-void cases
* Push channel (websocket/SSE) to the Runner: contradicts the pull-only Runner design for one feature

## Status

Proposed

## Consequences

- Command latency is bounded below by the Runner's poll interval (`RECOVERY_POLL_INTERVAL_MS`)
- A result that arrives after the Job left `Interactive-User` is discarded, so its screenshot and Transcript entry never appear
- New command kinds extend validation and the Runner's executor without changing the protocol
