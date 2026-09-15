# ADR: BambooInvoice in Docker as the local target application

**Author:** Agent (Eli Weinstock-Herman)

[Spec 0005](./spec.md) needs a local, no-API "Target Application" (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#overview)) for Runner development and e2e work, running self-contained in containers with no host-installed database (R001-R004). The originating idea was BambooInvoice (PHP/MySQL) via Docker, with an alternative WebForms-based app also floated, and the door left open to any option that meets the criteria.

## Decision

We will use [BambooInvoice](https://www.bambooinvoice.net/) (PHP/CodeIgniter, MySQL), sourced from the original `derekallard/BambooInvoice` repo and pinned to a specific commit, packaged with our own `Dockerfile` + `docker-compose.yml` (app + MySQL 5.7) and our own MySQL seed script, since no existing packaging of it meets our requirements as-is. The pinned source is fetched (`git clone` to the pinned commit) at Docker image build time rather than vendored into this repository, so the third-party source and its history stay out of our git history and diffs. The app runs on PHP 5.6, matching its 2009-era CodeIgniter 1.x codebase and legacy MySQL driver usage, rather than a newer PHP/MySQL combination.

## Rationale

BambooInvoice is open source (MIT), has no public API (UI-only, matching the "no API available" Target Application role), and both Docker and MySQL are already the user's preferred baseline — this avoids introducing an unfamiliar stack (e.g. Windows containers for a WebForms app) for a component whose only job is to be instrumented as a screen. A `Magentron/BambooInvoice` fork was initially considered for claimed PHP8/MySQL8 compatibility fixes, but inspection showed it's an unmodified copy of `derekallard/BambooInvoice` at the same single commit (2009), with no such fixes — the app still uses CodeIgniter 1.x's legacy `mysql`-family DB driver config, incompatible with PHP8 (which removed `ext/mysql`) and unreliable against MySQL8's default auth plugin. Rather than patch the third-party source to modernize it, we run it on PHP 5.6 + MySQL 5.7 (matching its actual vintage, via PHP's `mysqli` driver instead of the removed `ext/mysql`) unmodified, which is simpler and keeps the pinned source untouched. An existing Docker fork (`hannesdejager/bamboo-invoice`) was evaluated but has no `docker-compose`, no seed data, requires hand-editing three PHP config files pre-build, and uses the deprecated `docker run --link` flag — adopting it would cost as much rework as authoring our own compose file directly against the app source.

### Considered Options

* BambooInvoice (`derekallard/BambooInvoice`, original) + our own `docker-compose` + our own seed script (chosen) — open source, UI-only, PHP/MySQL matches the user's stated baseline and existing repo conventions (Docker/Linux containers); no existing packaging fit but the gap is small to close ourselves, and running it on PHP 5.6/MySQL 5.7 (its actual vintage) avoids patching third-party code.
* `Magentron/BambooInvoice` fork — rejected: turned out to be an unmodified copy of the original at the same commit; no PHP8/MySQL8 compatibility work exists there to justify using a fork over the original.
* Patching the source to run on PHP8/MySQL8 — rejected: meaningfully more work (rewriting the DB driver usage and other removed-function call sites) for a component whose only job is to be a stable target screen, not a modernization target.
* `hannesdejager/bamboo-invoice` Docker fork as-is — rejected: no compose, no seed data, manual pre-build config editing, legacy `--link` networking; using it would still require most of the same authoring work as starting from source.
* A WebForms-based sample app (e.g. an old Microsoft sample) — rejected: requires Windows containers, a heavier and less portable local-dev dependency than the Linux containers already implied by this repo's tooling, for no functional gain (both are equally "no-API, UI-only" targets).
* A from-scratch minimal Node/Express app built to have no API — rejected: defeats the purpose of a target app meant to stand in for a real legacy application with realistic screens/flows to instrument.

## Status

Proposed

## Consequences

* Adds a PHP 5.6/MySQL 5.7 runtime to the repo's container footprint, isolated to Docker — no PHP or MySQL install needed on the host, and no interaction with hub's SQLite or runner-web's TypeScript stack.
* Building the target app's image requires network access (to fetch the pinned source commit at build time, and to reach Debian's package archive for PHP extensions — both PHP 5.6's base image and MySQL 5.7 are EOL, so their upstream package/security repos may need archive mirrors over time); an offline build would need a cached image instead.
* The target app's source is a pinned third-party commit, not a repo we maintain features in; any BambooInvoice bugs encountered are worked around at the Runner/recipe level, not patched upstream, unless a fix is trivial and clearly load-bearing for our testing.
* Because the app is unmodified rather than patched for PHP8/MySQL8, this target app's stack (PHP 5.6, MySQL 5.7) is intentionally older than what a production PHP app would run today — acceptable since its only job is to be a stable, realistic screen to instrument, not to demonstrate a current stack.
* The `php:5.6-apache` base image is built on EOL Debian 9 (stretch), whose apt mirrors have moved to `archive.debian.org` and whose package signing keys have expired; the Dockerfile points apt there over plain HTTP and disables signature verification to install packages at all. This is an accepted reduction in supply-chain integrity guarantees for this one dev/test-only image — acceptable because it's never deployed anywhere beyond a developer's or CI's local containers, but worth calling out explicitly rather than leaving it implicit in a Dockerfile comment.
* Seed data and DB credentials for this container are fixture-only (never real data), committed alongside the Dockerfile/compose per [Spec 0005](./spec.md).
* Developers need Docker available locally to run the target application; this was already an accepted tradeoff per the originating idea.
* Developers run either Docker or Podman across their machines, so the compose file avoids engine-specific features (notably `depends_on: condition: service_healthy`) and the wrapper scripts auto-detect the available compose command, per [Spec 0005](./spec.md) C004.
