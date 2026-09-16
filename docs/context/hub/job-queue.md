# Job Queue: schema, claim atomicity, ownership, scripted steps

Use this pattern when touching Job persistence, claim-on-poll, or the Runner-facing step-reporting loop.

Reference: [jobRepository.ts](../../../src/hub/src/lib/server/repositories/jobRepository.ts) (`claimNextJobForRunner`), [runnerActions.ts](../../../src/hub/src/lib/server/runnerActions.ts) (`reportJobStep`)

Notable:
* A base/extension table split (`job` + `training_job`/`recipe_job` on `job_type_id`) always reads through a repository join, never `job` alone — an extension row is required, not optional, for the row's type.
* Claim-on-poll must select-then-conditionally-update in one transaction and trust the `UPDATE`'s affected-row count (not the earlier `SELECT`) to detect a lost race — that's what makes two concurrent claims on the same Job safe.
* Every terminal-status write (`updateJobStatus`) must no-op once a Job is already terminal — never let a late/duplicate call revive or overwrite a finished Job.
* Transcript sequence numbers are append-only and idempotent (`INSERT OR IGNORE` on `UNIQUE(job_id, sequence)`) — a repeated/late report must be a silent no-op, never a duplicate row or an error.
* `raw_value`/`safe_value` masking happens only inside the repository's upsert functions — never compute or pass a masked value from calling code.
* The scripted-step stand-in is server-authoritative: Hub alone decides progression/success/failure; a Runner must never count steps or decide an outcome itself.
