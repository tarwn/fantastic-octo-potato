# Spec: Job and Transcript structural change

## Goal

Replace the freeform `job.mode` string, freeform `job_transcript_entry.kind` string, and flat unmasked `job_result` value introduced by [spec 0006](./spec.md) with a structured, closed-vocabulary model: system-defined lookup tables (mirroring the existing `job_status`/`recipe_status` pattern) for transcript kind and job type, a Job base table plus per-type extension tables (Training vs Recipe), and a safe/raw value split for every field that can carry a sensitive value (Job inputs and Job outputs alike). The Runner is never trusted to author a transcript row's shape or to decide what's safe to display — Hub's action layer derives the stored `text` from a closed set of kinds, and only Hub code with an explicit, narrow repository call can ever read a raw (unmasked) value.

## Requirements

- R001: A `job_transcript_kind` system table (seeded, mirrored by a `TranscriptKind` TS enum, same pattern as `job_status`/`recipe_status`) provides the closed set of transcript row kinds: `Status`, `Info`, `Step`, `Recover`, `Halt`, `Observe`, `Plan`. `job_transcript_entry.kind` (currently free `TEXT`) becomes `job_transcript_kind_id INTEGER NOT NULL REFERENCES job_transcript_kind (id)`.
- R002: A `job_type` system table (seeded, mirrored by a `JobType` TS enum, same pattern) provides `Training` and `Recipe`. `job.mode` (currently free `TEXT`, validated only by the in-code `JOB_MODES`/`assertValidJobMode` allowlist) is replaced by `job_type_id INTEGER NOT NULL REFERENCES job_type (id)`.
- R003: A `sensitivity_type` system table (seeded, mirrored by a `SensitivityType` TS enum) provides `None`, `PII`, `Other`. Every field value that can be sensitive (Job ingredients, Job outputs) carries one.
- R004: The `job` table is split into a base table and one extension table per `JobType`, joined 1:1 on `job.id`:
  - `job` (base, all types): `id`, `customer_application_xref_id`, `job_type_id`, `job_status_id`, `runner_id`, `created_at`, `started_at`, `heartbeat_on`, `completed_at`. (`mode` is removed — replaced by `job_type_id`.)
  - `training_job` (`job_id` PK/FK, one row iff `job_type_id = Training`): `goal`, `starting_url`, `allowlist`, `max_steps`. These are exactly the fields R001–R007 of spec 0006 put on `job` directly; they move here unchanged.
  - `recipe_job` (`job_id` PK/FK, one row iff `job_type_id = Recipe`): `recipe_id INTEGER REFERENCES recipe (id)`. This table exists for structural completeness now (per C001, Recipe-based Jobs are not created or run by any code path this spec); it is not exercised by any Job this spec creates.
  - A repository read for a full `Job` always left-joins both extension tables and returns a discriminated union (`TrainingJob | RecipeJob`, tagged by `jobType`) as a nested `details` object — never both sets of fields flattened onto one object, and never a silently-`null` field the caller has to remember to check.
- R005: Job ingredient (input) and output values both follow the same safe/raw storage shape:
  - `job_ingredient` (`job_id`, `field_name`, `safe_value`, `raw_value`, `sensitivity_type_id`, `created_at`, `UNIQUE(job_id, field_name)`) — the merged Customer+Job input values for a Job. A Training Job's ingredients are the values collected for it (this spec: none beyond what's already scripted — see R010); a Recipe Job's ingredients are its declared inputs (not exercised this spec, per R004).
  - `job_result` gains `safe_value` and `sensitivity_type_id` columns alongside its existing `value` column, which is renamed `raw_value` (additive migration, not a hand-edit of the original spec-0006 migration, per the existing `job_transcript_entry`-status-column precedent).
  - On write (`upsertJobIngredient` / `upsertJobResult`), when `sensitivityType !== None`, `safe_value` is a fixed masking token (e.g. `"••••••"`); when `sensitivityType === None`, `safe_value === raw_value`. Masking is a fixed token only — no partial-reveal, no reversible encoding; this is a placeholder until real Runner/Hub masking (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#application-security)) lands.
  - Two repository read shapes per table: a **safe** read (`SafeIngredient`/`SafeResult` — `fieldName`, `safeValue`, `sensitivityType`, no raw field in the returned type at all) used by every Hub-facing API and UI path, and a **sensitive** read (`SensitiveIngredient = SafeIngredient & { rawValue: string }` / `SensitiveResult = SafeResult & { rawValue: string }`) used only where raw values are provably needed. This spec has no caller for the sensitive read yet (no export feature exists) — the function exists to make the safe/raw boundary real and enforced by type, not to be called.
- R006: The Runner-facing single Job-scoped `steps` endpoint (spec 0006 R005) keeps its one-URL, one-call-per-turn shape, but its request body becomes a closed, kind-discriminated union instead of `{ sequence, kind: string, text: string, resultField?, resultValue? }`:
  - `{ kind: "status", status: JobStatus, message: string }` — records a status-change transcript row and applies the status change (subject to the existing terminal-no-op and max-steps/finished server-authority rules from spec 0006 R007/R008; the Runner proposing `status` does not bypass Hub's own max-steps/finished determination for scripted Training steps).
  - `{ kind: "info", message: string }`
  - `{ kind: "step", sequence: number, message: string, inputs: string[], outputs: Array<{ fieldName: string; value: string }> }` — `inputs` names Job ingredients already known to Hub (Hub looks up each by `field_name` via the safe read and embeds `{ fieldName, safeValue, sensitivityType }`; an unknown name is a 400, not a silent drop — the Runner cannot smuggle a value in under `inputs`). `outputs` is the only place the Runner sends a raw value; Hub resolves each output's `sensitivityType` (R010) before persisting via `upsertJobResult` and before building the transcript row, and the transcript row only ever gets the safe projection.
  - `{ kind: "recover", message: string }`, `{ kind: "observe", message: string }`, `{ kind: "plan", message: string }` — plain messages, no field values, no masking concern.
  - `{ kind: "halt" }` is not runner-submittable as free text — it is the schema/enum slot for a future Intervention-Requested status change (per C002); no code path in this spec produces a `Halt` transcript row.
  - Validation of the discriminant and per-kind required fields happens in `reportJobStep` (or a kind-dispatch helper it calls) before any DB write — an unrecognized `kind` or a kind/field mismatch is a 400.
- R007: `job_transcript_entry.text` is `TEXT` (unchanged column type) but its logical shape depends on `kind`: for `Status`/`Info`/`Recover`/`Observe`/`Plan` it is a plain string; for `Step` it is a JSON-serialized `{ message: string; inputs: TranscriptFieldRef[]; outputs: TranscriptFieldRef[] }` where `TranscriptFieldRef = { fieldName: string; safeValue: string; sensitivityType: SensitivityType }`. Serialization happens only inside the repository's write function; deserialization happens only inside its row-mapping function — no other code JSON-parses or JSON-stringifies this column. The mapped `JobTranscriptEntry` TS type is a discriminated union on `kind` so a `Step` row's `text` is statically an object and every other kind's `text` is statically a string; callers (API handlers, Svelte components) get a compile error if they treat one as the other.
- R008: All Hub-facing reads (job detail API, transcript list, results list, ingredient list) use only the safe repository functions (R005) — there is no code path from an `/api/hub/*` route to a raw value. The Runner-facing `steps`/`poll` endpoints use the safe reads for anything they echo back (e.g. `inputs` in a `Step` submission) and never need the sensitive read either, since Hub — not the Runner — already holds the raw values it needs.
- R009: `src/hub/src/lib/types/job.ts`'s existing stub fields (`redacted?`, `pii?` on `JobTranscriptEntry`; `pending?`, `redacted?` on `JobResult`) are replaced by the real, always-present `sensitivityType` (and, for results, a `safeValue`) fields from R005/R007 — `TranscriptPanel.svelte` and `ResultsPanel.svelte` are updated to branch on `sensitivityType !== SensitivityType.None` instead of the old optional booleans, using the existing `RedactedValue` component unchanged. `TranscriptPanel.svelte` renders a `Step` row's `inputs`/`outputs` as labeled sub-rows (field name + value-or-`RedactedValue`); every other kind renders `text` as a single string, styled by `kind` the same way today's `transcript-cell-kind` already does (no per-field styling for `Observe`, matching the user's explicit "won't bother with styling field names like the mockup" call).
- R010: `SCRIPTED_TRAINING_STEPS` (the dev-only stand-in for LLM-directed steps, unchanged in spirit) gains an explicit `sensitivityType` per `resultField`, since Training Jobs have no Recipe to declare field sensitivity from (Recipe-based sensitivity declarations per `docs/todos/supporting-docs/recipe.md` are Recipe-Job-only, out of scope per R004). `reportJobStep`'s `Step`-kind handling reads this sensitivity off the matching scripted step definition (looked up by `resultField`) rather than trusting anything the Runner's request body claims about sensitivity — the Runner sends only the raw `value`.
- R011: Migrations are additive (new tables; `ALTER TABLE ... ADD COLUMN` / a new table replacing an old column via a follow-up migration that drops the old column), per the existing `job_transcript_entry`-status-column precedent — never a hand-edit of the original spec-0006 migration files. Per this spec's scope decision (no production Job data exists yet), migrations may `DROP`/recreate `job`, `job_transcript_entry`, and `job_result` outright instead of writing data-preserving `UPDATE`/backfill statements — there is no data to preserve.

## Constraints

- C001: No Recipe-based Job is created or run by any code this spec touches — `recipe_job` and the `Recipe` `JobType` exist as schema/type scaffolding only, per R004. Recipe compilation, Trial/Execute wiring, and the Ingredients-from-Recipe-declarations flow remain future work (spec 0006 C001/C004 still stand).
- C002: `Halt`/Intervention-Requested is schema-only this spec (R006) — no Human Intervention overlay, no status transition into it, matching spec 0006 C003.
- C003: Masking is a fixed opaque token, not real PII/secret detection — the `sensitivity_type` classification itself is either hand-authored (`SCRIPTED_TRAINING_STEPS`, R010) or a Recipe field declaration's `sensitive` flag translated to `PII`/`Other`/`None` (not exercised this spec per C001). No third-party detection library integration (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#runner) "Notable Specifics") is in scope.
- C004: No export/reporting feature is added that would call the sensitive (raw-value) repository reads from R005 — they exist to make the type boundary real, not because something consumes them yet.
- C005: Follows [Database Handling](../../context/hub/backend/database-handling.md) and [repository return-value conventions](../../context/hub/backend/repository-return-value-conventions.md) established by spec 0006: repos take `Database.Database`, dates via `dates.ts`, one row-mapping function per entity, inserts build the return value in-memory rather than re-selecting, validation guards on both write and row-mapping.
- C006: No data migration/backfill — per the user's explicit call, there is no production Job data yet, so migrations may drop and recreate the affected tables (R011).

## Sequencing

Step 1 lands all schema first (nothing else can compile against the new shapes otherwise). Steps 2-3 rebuild the repository and action/API layers on top of it. Step 4 updates the UI to finally consume the safe/sensitivity signals that were stubbed out in spec 0006. This spec must land before spec 0006's Step 5 (Runner-web job-aware main loop), since that loop is what will call the restructured `steps` endpoint contract from R006.

---

### Step 1 — DB schema: lookup tables, Job base/extension split, safe/raw ingredient and result columns

**Guard:** repository integration tests updated for the new shapes (see Step 2's guard); a migration smoke test (existing pattern, if any) confirms `npm run db:migrate` applies cleanly against a fresh DB.

**References**
- `src/hub/db/migrations/20260915234029_create_job_tables.sql`, `20260915235500_add_job_transcript_entry_status.sql` (existing job-table migrations to follow the additive-migration style of, not edit)
- `src/hub/src/lib/server/db/recipeStatus.ts` and `src/hub/src/lib/server/db/jobStatus.ts` (the system-table + TS-enum pattern to mirror exactly, including the "keep in sync with migration X" comment)
- [Database Handling](../../context/hub/backend/database-handling.md)

**Work:**
- New migration(s) under `src/hub/db/migrations/`:
  - `job_transcript_kind` (seeded: 1=Status, 2=Info, 3=Step, 4=Recover, 5=Halt, 6=Observe, 7=Plan), `job_type` (seeded: 1=Training, 2=Recipe), `sensitivity_type` (seeded: 1=None, 2=PII, 3=Other) — all "system data, never touched by `db:reset`", following the `job_status` table's exact shape (`id INTEGER PRIMARY KEY, name TEXT NOT NULL`).
  - Drop and recreate `job` with the R004 base-table shape (`job_type_id` replacing `mode`); create `training_job` and `recipe_job` extension tables.
  - Drop and recreate `job_transcript_entry` with `job_transcript_kind_id` replacing `kind` (TEXT).
  - Drop and recreate `job_result` with `raw_value`/`safe_value`/`sensitivity_type_id` replacing `value`; create `job_ingredient` with the same shape.
- `src/hub/src/lib/server/db/jobTranscriptKind.ts`, `jobType.ts`, `sensitivityType.ts`: TS enums mirroring the seeded ids, each with the "keep in sync with migration X" comment.
- Client-safe copies (`src/hub/src/lib/jobTranscriptKind.ts`, `sensitivityType.ts`) alongside the existing `src/hub/src/lib/jobStatus.ts`, since `TranscriptPanel.svelte`/`ResultsPanel.svelte` need to branch on kind/sensitivity client-side (R009). `jobType.ts`'s client copy is added only if a UI surface needs it this spec (Jobs list currently shows `mode` as a raw string per spec 0006 R010 — swap it to render off `JOB_TYPE_LABELS`).
- `resetUserData()`'s `USER_DEFINED_TABLES` list: add `job_ingredient`, keep `job_result`/`job_transcript_entry`/`job` (already present), add `training_job`/`recipe_job` before `job` (FK delete order); leave the three new lookup tables untouched (system data).

---

### Step 2 — Repository layer: base+extension Job reads, safe/raw ingredient and result reads, structured transcript serialization

**Guard:** update `jobRepository.integration.test.ts` for: base+extension join returns a correctly-discriminated `Job` for each `JobType`; `insertJob` writes to the right extension table only; `upsertJobIngredient`/`upsertJobResult` mask correctly per `sensitivityType`; the safe read functions' return type has no raw-value field reachable at compile time (a `// @ts-expect-error` test line asserting `result.rawValue` doesn't type-check is acceptable here, matching how sensitive type boundaries are usually pinned down in this codebase); `appendTranscriptEntry`'s `Step`-kind write round-trips through `listTranscriptEntries` with `text` coming back as a parsed object, every other kind as a string.

**References**
- `src/hub/src/lib/server/repositories/jobRepository.ts` (current single-table implementation to split)
- [repository return-value conventions](../../context/hub/backend/repository-return-value-conventions.md)

**Work:**
- Split `jobRepository.ts`'s `Job`-shaped functions to join `training_job`/`recipe_job` and return `{ ...baseFields, jobType: JobType.Training, details: TrainingJob } | { ...baseFields, jobType: JobType.Recipe, details: RecipeJob }`. `insertJob` takes a discriminated-union params type and writes the base row plus exactly one extension row in the same transaction.
- New `jobIngredientRepository.ts` (or a `job_ingredient` section of `jobRepository.ts`, matching whichever grouping the existing file's size favors): `upsertJobIngredient(db, jobId, fieldName, rawValue, sensitivityType, createdAt)` (masks internally per R005), `listSafeJobIngredients(db, jobId): SafeIngredient[]`, `getSafeJobIngredientByFieldName`, and `listSensitiveJobIngredients(db, jobId): SensitiveIngredient[]` (unused this spec per C004, exists for the type boundary).
- `job_result`'s existing functions (`upsertJobResult`, `listJobResults`) gain the same safe/sensitive split; `upsertJobResult`'s signature gains a `sensitivityType` parameter (R010 supplies it from the scripted step definition).
- `appendTranscriptEntry` becomes kind-aware: a `Status`/`Info`/`Recover`/`Observe`/`Plan` call takes a plain `message: string`; a `Step` call takes `{ message, inputs: TranscriptFieldRef[], outputs: TranscriptFieldRef[] }` and JSON-serializes it into the `text` column. `mapTranscriptEntryRow` JSON-parses `text` only when `job_transcript_kind_id === TranscriptKind.Step`, producing the R007 discriminated union.

---

### Step 3 — Hub action/API layer: kind-dispatched `steps` endpoint, ingredient/result sensitivity resolution

**Guard:** update `jobActions.integration.test.ts`/`runnerActions.integration.test.ts` for: each of the 6 submittable kinds (`status`/`info`/`step`/`recover`/`observe`/`plan`) round-trips through the endpoint into the correctly-shaped transcript row; an unrecognized `kind` or a kind/field mismatch is a 400; a `step` submission with an `inputs` name not present in `job_ingredient` is a 400; a `step` submission's `outputs` are persisted via `upsertJobResult` with the sensitivity resolved from `SCRIPTED_TRAINING_STEPS` (R010), never from the request body; the job-detail API's response never contains a `rawValue` key anywhere in its JSON (a serialization-level assertion, not just a type-level one).

**References**
- `src/hub/src/lib/server/runnerActions.ts`, `jobActions.ts` (current implementations to extend)
- [API request/response conventions](../../context/hub/backend/api-request-response-conventions.md)

**Work:**
- `reportJobStep`'s body validation becomes a `kind`-discriminated switch (R006); each branch calls the matching `appendTranscriptEntry` overload from Step 2. The existing max-steps/finished terminal-status logic (spec 0006 R007) moves inside the `step` branch, since only a `Step` submission advances the scripted sequence.
- `createJob` (`jobActions.ts`) writes to `training_job` via the Step 2 discriminated `insertJob`, and creates any Training Job ingredients defined for it (none beyond what's already scripted this spec — Training Jobs still take no client-supplied ingredients per spec 0006's modal fields; this is the hook R010's future "LLM adds inputs shortly after creation" work will use).
- `getJobDetail` assembles `{ ...job (with details), transcript: listTranscriptEntries(...), results: listJobResults(...) (safe), ingredients: listSafeJobIngredients(...) }` — all safe reads (R008).
- `SCRIPTED_TRAINING_STEPS` (`scriptedTrainingSteps.ts`) gains `sensitivityType?: SensitivityType` per entry (defaulting to `None` where absent), per R010.

---

### Step 4 — Hub UI: consume real sensitivity signals, render structured `Step` transcript rows

**Guard:** existing hub e2e Job-lifecycle test (spec 0006 Step 4's guard) still passes; component tests for `TranscriptPanel.svelte` covering a `Step`-kind row's rendered inputs/outputs (masked vs plain) and a non-`Step` row's plain-text rendering; `ResultsPanel.svelte` component test for the masked-vs-plain branch on `sensitivityType`.

**References**
- `src/hub/src/routes/jobs/[id]/_components/TranscriptPanel.svelte`, `ResultsPanel.svelte`
- `src/hub/src/lib/types/job.ts`, `src/hub/src/lib/components/RedactedValue.svelte`

**Work:**
- `src/hub/src/lib/types/job.ts`: replace the spec-0006 stub fields with the real R005/R007/R009 shapes (`JobTranscriptEntry` as a discriminated union on `kind`; `JobResult`/`SafeIngredient` carrying `safeValue`/`sensitivityType`).
- `TranscriptPanel.svelte`: branch on `entry.kind === TranscriptKind.Step` to render `entry.text.inputs`/`entry.text.outputs` as labeled rows (reusing `RedactedValue` per `sensitivityType !== None`); every other kind renders `entry.text` as today's single string.
- `ResultsPanel.svelte`: branch on `result.sensitivityType !== SensitivityType.None` (replacing the old `redacted`/`pending` optional booleans) to choose `RedactedValue` vs plain text.
- Jobs list / Job detail header: if `job.mode` was rendered anywhere as a raw string (spec 0006 R010/R012), swap to `JOB_TYPE_LABELS[job.jobType]`.

---

## Out of scope

- Recipe-based Job creation/execution, Ingredients-from-Recipe-declarations, Trial/Execute wiring (C001).
- Human Intervention overlay and any real transition into `Halt`/Intervention-Requested (C002).
- Real PII/secret detection (regex, third-party library, or credential-aware masking) — fixed-token masking only (C003).
- Any raw-value export/reporting feature (C004).
- Data-preserving migration/backfill of existing Job rows (C006) — not needed, no production data exists.
- Training Job ingredients added post-creation by an LLM reading the prompt (mentioned in the user's design discussion as a near-future capability) — `job_ingredient` exists and is populated for scripted results this spec, but no code path adds a Training Job ingredient after creation yet.

## Traceability

- Source: user-directed design discussion (2026-09-15) on structuring `job_transcript_entry.kind` and Job's field set ahead of Runner-web's job-aware main loop (spec 0006 Step 5).
