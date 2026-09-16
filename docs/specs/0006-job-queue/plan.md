This is the plan for [0006-job-queue/spec.md](./spec.md).

- [x] 1. Multi-service e2e guard: full Job lifecycle
- [x] 2. DB schema and repositories: job, job_status, transcript, results
- [x] 3. Hub APIs: job creation, list/detail, cancel, and Runner-facing claim/steps
- [x] 4. Hub UI: real Jobs list/detail, modal wiring, Runner activity, cancel button
- Job and transcript structural change: [spec-job-and-transcript-change.md](./spec-job-and-transcript-change.md)
    - [x] DB schema: lookup tables, Job base/extension split, safe/raw ingredient and result columns
    - [x] Repository layer: base+extension Job reads, safe/raw ingredient and result reads, structured transcript serialization
        - Restores and rewrites the three integration test files disabled by Step 1 (renamed `.disabled`, not deleted): `src/hub/src/lib/server/repositories/jobRepository.integration.test.ts`, `src/hub/src/lib/server/jobActions.integration.test.ts`, `src/hub/src/lib/server/runnerActions.integration.test.ts`.
    - [x] Hub action/API layer: kind-dispatched `steps` endpoint, ingredient/result sensitivity resolution
    - [ ] Hub UI: consume real sensitivity signals, render structured `Step` transcript rows
- [ ] 6. Runner-web: job-aware main loop
- [ ] 7. Docs
