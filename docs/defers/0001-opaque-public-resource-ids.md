# DEFER 1: Opaque/unguessable public resource ids

## What?
`job`, `runner`, and other resource ids exposed in Hub URLs and APIs are plain auto-incrementing SQLite integers. A caller who can guess or enumerate nearby ids (e.g. `job/43` → try `job/44`) can probe for the existence of, or attempt access to, another Customer's records. Switching to an opaque/unguessable public id (e.g. a UUID or random token used at the API boundary, separate from the internal integer primary key) is deferred.

## Why?
No user authentication/authorization exists yet (multi-tenant RBAC is `(FUTURE)` per [ARCHITECTURE.md](../../ARCHITECTURE.md#deferred-capabilities)) — today's only access boundary for Jobs is the Runner bearer secret plus a `runner_id`/`customer_application_xref_id` ownership check (spec [0006-job-queue](../specs/0006-job-queue/spec.md)), and the Hub UI itself is single-tenant with no login. Adding opaque ids now would be solving for an attacker model (external, unauthenticated probing) that doesn't yet apply, ahead of the RBAC/multi-tenant work that will actually define the access boundary these ids need to respect. Revisit alongside Multi-Tenant/User Authorization (`ARCHITECTURE.md` Mid-Term).
