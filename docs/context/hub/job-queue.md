# Job Queue: schema, claim atomicity, ownership, Training's LLM-directed steps

Use this pattern when touching Job persistence, claim-on-poll, or the Runner-facing step-reporting loop.

Reference: [jobRepository.ts](../../../src/hub/src/lib/server/storage/repositories/jobRepository.ts) (`claimNextJobForRunner`), [jobActions.ts](../../../src/hub/src/lib/server/jobs/jobActions.ts) (`reportJobStep`)

Notable:
* A base/extension table split (`job` + `training_job`/`recipe_job` on `job_type_id`) always reads through a repository join, never `job` alone — an extension row is required, not optional, for the row's type.
* `job.name` is set once at insertion (the Recipe's name for Trial/Execute, "Training Run" for Training) and never updated, so a Job keeps its creation-time name even after its Recipe is renamed or archived.
* Claim-on-poll must select-then-conditionally-update in one transaction and trust the `UPDATE`'s affected-row count (not the earlier `SELECT`) to detect a lost race — that's what makes two concurrent claims on the same Job safe.
* Every terminal-status write (`updateJobStatus`) must no-op once a Job is already terminal — never let a late/duplicate call revive or overwrite a finished Job.
* Transcript sequence numbers are append-only and idempotent (`INSERT OR IGNORE` on `UNIQUE(job_id, sequence)`) — a repeated/late report must be a silent no-op, never a duplicate row or an error.
* `raw_value`/`safe_value` masking happens only inside the repository's upsert functions — never compute or pass a masked value from calling code.
* Training (`training_job`) is server-authoritative: Hub alone decides progression/success/failure — it derives each next Step via an LLM call (`nextStep.ts`'s `deriveNextStep`), persists it to `training_job_step` before ever handing it to the Runner, and decides maxSteps/finish/error outcomes; a Runner must never count steps or decide an outcome itself. This applies to Training only.
* `recipe_job` is different by design: the Runner is authoritative over DSL Step progression *within* a Hub-persisted, Hub-validated Recipe (validated at save/dispatch time — steps-dsl.md, [recipe.md](../../todos/supporting-docs/recipe.md)); Hub only receives and persists what the Runner reports. See [Recipe Automatic Loop](../runner-web/recipe-automatic-loop.md) for how the Runner exercises that authority. This does not weaken Hub's authority over Training above — the two Job types have deliberately different progression models.
