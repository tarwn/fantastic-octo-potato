# ADR N: Vitest for unit/component tests

**Author:** Agent (Eli Weinstock-Herman)

Both hub and runner-web need a unit/component test runner: hub for a component that consumes SCSS, runner-web for its console logger's prefix behavior. The setup todo directs adding vitest to both scopes by name.

## Decision

We will use vitest as the unit/component test runner for both hub (`src/hub`) and runner-web (`src/runner-web`).

## Rationale

The author is actively using vitest across several other projects and has previously evaluated it against Jest and other alternatives, where it came out faster and integrates well with an already Vite-based setup (relevant here since hub is SvelteKit, which is Vite-based). Already vetted recently enough elsewhere that re-running that comparison for this repo wasn't warranted. Recorded because it establishes the repo's unit-test tooling and its nx/npm task wiring (`test:hub:unit-tests`, `test:runner-web:unit-tests`, etc.) for both scopes going forward.

### Considered Options

* Vitest — faster than Jest in the author's prior evaluation, integrates natively with Vite-based builds (hub's SvelteKit stack)
* Jest — common alternative; previously evaluated by the author and came out slower for comparable setups

## Status

Proposed

## Consequences

- Unit/component test tasks across hub and runner-web follow vitest's config and conventions
- Vitest's native Vite integration avoids a separate bundler/transform step for hub's SvelteKit components
