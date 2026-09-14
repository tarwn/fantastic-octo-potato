# Front-end conventions

Durable rules for Svelte pages and components.

- **SCSS tokens only** — no raw/hardcoded values in component styles; use
  [design-system](./design-system.md) tokens for all size, spacing, color, and text/font values.
  - Do not introduce new exceptions without user-agreement.
  - Only allowable exceptions:
    - a form column, table column, or panel column width to manage layout in specific scenarios
    - hairline border/rule may be the literal `1px`,
  matching every other border in the design system.
- **Local-first components** — new components start in the page's local
  `_components` folder; promote to a shared top-level `components`
  folder (under `src/hub/src/lib/`) only once reused elsewhere. Extract an SCSS
  mixin only once multiple components share the same visuals or many
  color variants of one (typically atomic) element.
- **Underscore-prefixed local folders** — any folder under `src/hub/src/routes`
  that exists to support one page/route rather than to define a route
  itself (e.g. `_components`) is underscore-prefixed, both to signal
  "local support, not routing" at a glance and because SvelteKit
  already excludes underscore-prefixed folders from routing. Shared
  folders promoted to `src/hub/src/lib/` don't need the underscore — `$lib`
  is already outside the routes tree.
- **Shared test helpers live in a `_test/` folder** — a fixture/builder
  factory used by 3+ test files in the same area moves to a `_test/`
  folder next to those files, never
  a `*.test-helpers.ts` sibling file.
- **Semantic HTML, minimal aria** — pick the element for its native
  behavior (links navigate, buttons act), regardless of visual styling;
  add aria only where semantics alone fall short.
- **Design system/task over mockup** — when a mockup disagrees with the
  design system or task instructions, the latter win. Ask if unclear;
  never silently defer to the mockup.
- **Strict Svelte conventions** by default.
- **SCSS lives in the component** — each component keeps its styles in
  its own `<style lang="scss">` block; there's no separate global
  stylesheet. Site-wide base styles go in the root `+layout.svelte`,
  scoped out with `:global(...)`.
- **Test file placement and size** — default is a test file living next
  to the file under test as `*.test.ts` (matching vitest's `include`
  glob in `vite.config.ts`). If it exceeds 400 lines, extract one
  `describe` block into a neighboring `*.{topic}.test.ts` file instead
  of letting the original file keep growing. Enforced by
  `npm run guard:tools:test-file-size`.

