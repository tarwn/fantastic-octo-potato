# Repository Return Value Conventions

Keeps every caller of a repository working with the same shape, regardless of which function produced it.

Reference: [jobRepository.ts](../../../../src/hub/src/lib/server/storage/repositories/jobRepository.ts)

Notable:
* **An insert that hands the caller back an entity returns the full thing, built in-memory from known inputs plus the generated id** — `insertJob` never re-selects the row it just wrote; it constructs the `Job` object directly from `lastInsertRowid` and the params it already has (see [Database Handling](./database-handling.md) for the `dates.ts` translation used here). Avoid the temptation to re-query for "safety" — if the object being returned isn't provably identical to what a re-select would produce, that's a sign the write itself is wrong, not a reason to add a round trip. (A write whose callers never need the row back, like `appendTranscriptEntry` or `upsertJobResult`, just returns `void`.)
* **Every read goes through one row-mapping function per entity**, e.g. `mapJobRow(row: JobRow): Job`, so `getJobById`, `listJobs`, and any other read function all produce the exact same public shape from the exact same translation logic (date parsing, enum narrowing, etc.) — never hand-roll the mapping inline at each call site.
* **Updates return `void` when the caller has no use for the row back** (`updateJobHeartbeat`), or the full updated entity when a caller needs it in the same call — `claimNextJobForRunner` runs its find-and-claim as one transaction and returns the claimed `Job` by reusing `mapJobRow` on the pre-update row with the fields the `UPDATE` changed spliced in, rather than a second `SELECT` after the write.
* A validation guard (e.g. `assertValidJobMode`) that protects a written column belongs on both sides: the write path (so a bad value can't be persisted) and the row-mapping function (so a bad value already in the table, from any other writer, surfaces on read too) — see `jobRepository.ts`'s `insertJob` and `mapJobRow`.
