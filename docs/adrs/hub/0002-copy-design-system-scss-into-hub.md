# ADR 2: copy design-system SCSS into the hub app instead of importing from `docs/design/scss`

**Author:** Agent (Eli Weinstock-Herman)

`docs/design/scss` holds the design system's tokens (`_variables.scss`) and component mixins (`components/*.scss`), authored and reviewed as design artifacts alongside the `.dc.html` mockups and `components.scss`/`.css` reference build. Hub Svelte components need these tokens and mixins in their own `<style lang="scss">` blocks (per [conventions.md](../../context/hub/conventions.md)'s SCSS-tokens-only rule).

## Decision

We will copy `_variables.scss` and the `components/` mixin partials unchanged into `src/hub/src/lib/styles/` (`variables.scss` and `mixins/*.scss`) as the app's own copy of the design system, rather than having hub's build import or reference `docs/design/scss` directly. `docs/design/scss` remains the source of truth for design updates; the app copy must be re-synced by hand when it changes.

## Rationale

`docs/design/scss` sits under `docs/`, a documentation/design tree outside `src/hub`'s build root, and carries docs-only reference artifacts (`components.scss`, `components.css`, `support.js`) that hub must not ship. Referencing it directly from `src/hub` would couple the app's build to a docs folder's layout and force hub to filter out the reference-only files at build time.

### Considered Options

* Copy the tokens/mixins into `src/hub/src/lib/styles/` (chosen) — a plain, explicit app-owned copy; the SCSS itself doesn't change, only its location, so `@use` paths inside the partials stay unchanged.
* Import `docs/design/scss` directly from hub (e.g. a relative `@use` reaching outside `src/hub`, or a path alias) — couples the build to a docs folder outside the app's own tree, and doesn't exclude the docs-only reference artifacts.
* Publish the design system as its own workspace package — more structure than a single-app SCSS copy currently needs; revisit if a second consumer (e.g. a future admin app) appears.

## Status

Proposed

## Consequences

* The design system has two copies on disk: `docs/design/scss` (source of truth) and `src/hub/src/lib/styles` (app copy). A design update must be applied to `docs/design/scss` first, then re-synced into the app copy by hand — there is no automated sync.
* Hub's SCSS build has no dependency on anything outside `src/hub`.
* Component mixin partials keep the same `@use "../variables" as *;` paths they had in `docs/design/scss/components/`, since the copy mirrors that folder's relative structure.
