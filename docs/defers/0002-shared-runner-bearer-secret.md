# DEFER 2: Shared single Runner bearer secret

## What?
Every Runner authenticates to Hub with the same `RUNNER_SHARED_SECRET` bearer token (introduced in spec 0004, still the only auth mechanism as of spec [0006-job-queue](../specs/0006-job-queue/spec.md)). Any process holding that one value can call `init`/`poll`/`steps` as any `[id]` it names — the endpoints trust the path segment's Runner id, not a credential tied to that specific Runner. Per-runner credentials/registration (issuing each Runner its own secret or token at registration time, and validating the caller's identity against it rather than a shared value) is deferred.

## Why?
There's exactly one deployment shape today (a small, trusted set of Runners the operator controls directly) and no Runner registration flow to issue/rotate per-runner credentials against — building real credentialing now would be speculative ahead of that flow existing. `job.runner_id`/`customer_application_xref_id` ownership checks (this spec) already prevent a Runner authenticated with the shared secret from claiming or acting on a Job outside its own Customer x Application, so the shared secret's blast radius is bounded by that check, not open to any Job. Revisit alongside Runner Registration, listed `(FUTURE)` in [ARCHITECTURE.md](../../ARCHITECTURE.md#application-security).
