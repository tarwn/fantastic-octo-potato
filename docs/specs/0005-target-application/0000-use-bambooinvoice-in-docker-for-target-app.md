# ADR: BambooInvoice in Docker as the local target application

**Author:** Agent (Eli Weinstock-Herman)

[Spec 0005](./spec.md) needs a local, no-API "Target Application" (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#overview)) for Runner development and e2e work, running self-contained in containers with no host-installed database (R001-R004). The originating idea was BambooInvoice (PHP/MySQL) via Docker, with an alternative WebForms-based app also floated, and the door left open to any option that meets the criteria.

## Decision

We will use [BambooInvoice](https://www.bambooinvoice.net/) (PHP/CodeIgniter, MySQL), sourced from the maintained `Magentron/BambooInvoice` fork and pinned to a specific commit, packaged with our own `Dockerfile` + `docker-compose.yml` (app + MySQL) and our own MySQL seed script, since no existing packaging of it meets our requirements as-is. The pinned source is fetched (`git clone` to the pinned commit) at Docker image build time rather than vendored into this repository, so the third-party source and its history stay out of our git history and diffs.

## Rationale

BambooInvoice is open source (MIT), has no public API (UI-only, matching the "no API available" Target Application role), and both Docker and MySQL are already the user's preferred baseline — this avoids introducing an unfamiliar stack (e.g. Windows containers for a WebForms app) for a component whose only job is to be instrumented as a screen. The original `derekallard/BambooInvoice` repo is unmaintained; `Magentron/BambooInvoice` carries PHP8/MySQL8 compatibility fixes, so it's the better base to build from. An existing Docker fork (`hannesdejager/bamboo-invoice`) was evaluated but has no `docker-compose`, no seed data, requires hand-editing three PHP config files pre-build, and uses the deprecated `docker run --link` flag — adopting it would cost as much rework as authoring our own compose file directly against the app source.

### Considered Options

* BambooInvoice (`Magentron` fork) + our own `docker-compose` + our own seed script (chosen) — open source, UI-only, PHP/MySQL matches the user's stated baseline and existing repo conventions (Docker/Linux containers), no existing packaging fit but the gap is small to close ourselves.
* `hannesdejager/bamboo-invoice` Docker fork as-is — rejected: no compose, no seed data, manual pre-build config editing, legacy `--link` networking; using it would still require most of the same authoring work as starting from source.
* A WebForms-based sample app (e.g. an old Microsoft sample) — rejected: requires Windows containers, a heavier and less portable local-dev dependency than the Linux containers already implied by this repo's tooling, for no functional gain (both are equally "no-API, UI-only" targets).
* A from-scratch minimal Node/Express app built to have no API — rejected: defeats the purpose of a target app meant to stand in for a real legacy application with realistic screens/flows to instrument.

## Status

Proposed

## Consequences

* Adds a PHP/MySQL runtime to the repo's container footprint, isolated to Docker — no PHP or MySQL install needed on the host, and no interaction with hub's SQLite or runner-web's TypeScript stack.
* Building the target app's image requires network access (to fetch the pinned source commit at build time); an offline build would need a cached image instead.
* The target app's source is a pinned third-party commit, not a repo we maintain features in; any BambooInvoice bugs encountered are worked around at the Runner/recipe level, not patched upstream, unless a fix is trivial and clearly load-bearing for our testing.
* Seed data and DB credentials for this container are fixture-only (never real data), committed alongside the Dockerfile/compose per [Spec 0005](./spec.md).
* Developers need Docker available locally to run the target application; this was already an accepted tradeoff per the originating idea.
* Developers run either Docker or Podman across their machines, so the compose file avoids engine-specific features (notably `depends_on: condition: service_healthy`) and the wrapper scripts auto-detect the available compose command, per [Spec 0005](./spec.md) C004.
