# ADR 3: SQLite, dbmate, and better-sqlite3 for hub persistence

**Author:** Agent (Eli Weinstock-Herman)

Hub had no database dependency before spec [0003-hub-data-foundation](../../specs/0003-hub-data-foundation/spec.md) — the Job Screen renders hardcoded mock data. That spec introduces real persistence for Customer, Application, Runner, and Recipe data (R001, R004), and constraint C006 calls for an ADR on the storage engine, migration tool, and driver chosen.

## Decision

We will store hub's data in SQLite, manage schema changes as versioned migrations via [dbmate](https://github.com/amacneil/dbmate) (the standalone CLI, installed as the npm `dbmate` package and invoked through `db:migrate:up`/`down`/`new` npm scripts), and connect to it at runtime from Node/SvelteKit using the `better-sqlite3` driver.

## Rationale

Hub currently runs as a single SvelteKit process with a small, mostly-read schema (six tables this spec, per [Schema](../../specs/0003-hub-data-foundation/spec.md#schema)). An embedded, single-file database matches that shape without adding an operational dependency (a database server to run locally and in CI). dbmate gives plain-SQL, versioned up/down migrations (`-- migrate:up` / `-- migrate:down`) without pulling in a JS-side migration framework or ORM. `better-sqlite3`'s synchronous API is a good fit for SvelteKit's per-request server route handlers and is the most mature/widely-used native SQLite binding for Node.

### Considered Options

* SQLite + dbmate + better-sqlite3 (chosen) — embedded database, language-agnostic migration CLI, mature synchronous driver; no server process to run/manage, no ORM/codegen layer.
* Prisma or Drizzle (ORM) — adds a schema-DSL and codegen step beyond what this spec's small, read-heavy schema needs; revisit if the schema or query surface grows enough to justify it.
* Postgres (or another client-server database) — adds an operational dependency (a database server) for local dev and CI that a single-process embedded database doesn't need at hub's current scale.
* `node:sqlite` (Node's built-in SQLite module) — still experimental/less battle-tested across the supported Node range than `better-sqlite3`, with a thinner ecosystem.
* Hand-rolled SQL migration runner — reinvents what dbmate already does as a small, well-established, language-agnostic tool.

## Status

Accepted

## Consequences

* dbmate is a separate Go binary (fetched as the npm `dbmate` package, not a JS library), so migrations are authored as plain `.sql` files with `-- migrate:up`/`-- migrate:down` markers rather than a TypeScript-native migration DSL.
* `better-sqlite3` is synchronous-only (no async/await, no connection pool) — fine for SvelteKit's single-process server route model, but a poor fit if hub ever needs a high-concurrency multi-process server; that would require revisiting this decision.
* SQLite constrains hub to a single-writer-process deployment model. Acceptable for hub's current architecture; revisit this ADR if that architecture changes (e.g. multiple hub instances writing to the same database).
* `db/migrations` and `HUB_DATABASE_URL` (a `sqlite:` URL) become new project conventions; `.data/` (hub's default database directory) is gitignored, with `.env.example` documenting the env var.
