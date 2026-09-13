# Design System

Use this when a component needs design-system tokens or mixins.

Reference: [StatusBadge.svelte](../../../src/hub/src/lib/components/StatusBadge.svelte)

* Tokens live in `src/hub/src/lib/styles/variables.scss`; mixins live in `src/hub/src/lib/styles/mixins/*.scss` — these are hub's own copy of the design system, not a build-time reference to `docs/design/scss`.
* Import the mixin surface with `@use "../styles/mixins" as *;` (path relative to the component), which re-exports `variables.scss` — no separate `@use` for variables is needed.
* `docs/design/scss` is imported from the source of truth, do not edit it.
