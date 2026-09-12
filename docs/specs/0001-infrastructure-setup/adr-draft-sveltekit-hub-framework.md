# ADR N: SvelteKit for the hub

**Author:** Agent (Eli Weinstock-Herman)

The hub (`src/hub/*`) needs a UI framework that also serves as the API surface for runner integration (per CLAUDE.md's Project Structure: "SvelteKit website that combines front-end with back-end"). The initial infrastructure todo directs installing SvelteKit; the pre-copied `eslint.config.js` was already authored with Svelte-specific rules (svelte plugin, `.svelte`/`.svelte.ts` overrides) before this spec, and README.md documents a SvelteKit-based dev flow.

## Decision

We will use SvelteKit as the hub's framework, combining the front-end UI and its backend API in one app.

## Rationale

The author is already familiar with SvelteKit. Svelte tends to produce less code than React for equivalent capability, and a batteries-included framework serving both front-end and backend is simpler than maintaining two separate codebases (e.g. a React front-end plus a separate Fastify API) for this project's goal. Recorded here because it's a foundational framework choice for a core project, and CLAUDE.md's Project Configuration section previously described the hub as Fastify+React, which this decision supersedes and corrects.

### Considered Options

* SvelteKit — familiar to the author, less code than React for equivalent capability, combines front-end and backend in one app
* React + Fastify — CLAUDE.md's prior (stale) description; would split the hub into two codebases for no benefit to this project's goal

## Status

Proposed

## Consequences

- CLAUDE.md's Hub line is SvelteKit going forward; the earlier Fastify+React description no longer applies
- Hub component code, tests, and lint rules follow Svelte conventions (`.svelte` files, `svelte/indent`, etc.)
- The hub's backend API (for runner integration) will live inside the SvelteKit app rather than as a separate Fastify service
