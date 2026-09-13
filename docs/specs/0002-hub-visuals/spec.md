# Spec 0002: Hub Visuals

## Goal

A user opening a Job in Hub sees the Job Screen (header, status/detail strip, Transcript, Results, Export) rendered with the shared design-system tokens/mixins, using hardcoded mock data — establishing the visual foundation and design-system docs the later data-backed pages build on.

## Requirements

- R001: The design-system tokens and component mixins from `docs/design/scss` are usable from Hub Svelte components.
- R002: A Job Screen route renders, for a mock Execute-mode job: header (title, Export JSON action), a status/detail strip (stage, status, recipe, target application, customer), a Transcript panel, and a Results panel — per [ARCHITECTURE.md](../../../ARCHITECTURE.md#user-interface) Job Screen bullet.
- R003: The same Job Screen also renders a Training-mode mock job (adds a Goals panel), matching the second example in the mockup.
- R004: `docs/context/hub/design-system.md` documents the minimal rules for using the design system in hub, without duplicating [conventions.md](../../context/hub/conventions.md).
- R005: Any doc under `docs/context/hub` not linked from `_index.md` is reviewed and fixed up.

## Constraints

- C001: SCSS tokens only in component styles — no raw hardcoded values ([conventions.md](../../context/hub/conventions.md)).
- C002: New Job Screen components start local (`_components`) per page, per [conventions.md](../../context/hub/conventions.md).
- C003: SCSS lives in the component's own `<style lang="scss">` block; no new global stylesheet.
- C004: Mockup is directional — the design-system SCSS artifacts and this spec win over the `.dc.html` mockup where they disagree ([conventions.md](../../context/hub/conventions.md)).
- C005: No API, database, or Runner integration in this spec — job data is hardcoded in the page/component.

## Sequencing

Step 1's e2e guard stays red until Step 3 lands the Job Screen.

---

### Step 1 — Job Screen e2e guard

**Guard:** new `src/hub/e2e/job.spec.ts`, red until Step 3.

**References**
- [Hub e2e conventions](../../context/hub/e2e/conventions.md)
- [ARCHITECTURE.md — User Interface, Job Screen](../../../ARCHITECTURE.md#user-interface)
- [Hub Job Page mockup](../../design/Hub Job Page.dc.html) — for the two example jobs' visible content

**Work:**
- Add `src/hub/e2e/job.spec.ts` asserting, by role/text, the Execute-mode mock job's title, Export JSON button, strip fields (stage/status/recipe/target application/customer), Transcript entries, and Results fields.
- Add a second test for the Training-mode mock job asserting the same plus the Goals panel.

---

### Step 2 — Pull in the design-system SCSS

**Guard:** `npm run guard:hub:stylelint`; visually spot-check one styled element against [Hub Components mockup](../../design/Hub Components.dc.html) via the `verify-ui` skill.

**References**
- [Design files index](../../design/_index.md)
- `docs/design/scss/_variables.scss`, `docs/design/scss/components/*.scss`
- [Hub components conventions](../../context/hub/frontend/components.md) — already references a `styles/mixins/` location for "the full mixin surface"; this step is what makes that location real.

**Work:**
- Copy `_variables.scss` into `src/hub/src/lib/styles/variables.scss`, and the `components/` mixin partials (`_button`, `_panel`, `_redacted`, `_status-bar`, `_status-change`, `_transcript`, `_index`) into `src/hub/src/lib/styles/mixins/`, unchanged, as the app's copy of the design system.
- Do not copy `components.scss`/`components.css`/`support.js` — those are docs-only reference artifacts; app components author their own semantic classes against the mixins per C003, using `components.scss` only as a usage reference.
- Draft an ADR (via `write-adr`) for copying the SCSS into the app rather than importing/building from `docs/design/scss` directly: the app copy is the consumable artifact, `docs/design/scss` stays the source of truth for design updates and must be re-synced by hand.

---

### Step 3 — Implement the Job Screen

**Guard:** Step 1's `job.spec.ts` passes; then use `verify-ui` to screenshot both mock jobs and pause for the user's own visual comparison against the mockup — role/text assertions don't catch layout/spacing/visual fidelity, and the user can judge that against [Hub Job Page mockup](../../design/Hub Job Page.dc.html) more precisely than an automated check.

**References**
- [ARCHITECTURE.md — User Interface, Job Screen; Job Coordination](../../../ARCHITECTURE.md#job-coordination)
- [Hub Job Page mockup](../../design/Hub Job Page.dc.html)
- [Hub components conventions](../../context/hub/frontend/components.md)

**Work:**
- Add a Job Screen route (e.g. `src/hub/src/routes/jobs/[id]/+page.svelte`) with local `_components` for the strip, Transcript panel, Results panel, and Goals panel.
- Hardcode two mock jobs matching the mockup's two examples (Execute-mode "Statement Extract — March", Training-mode "Learn: Statement Extract"), selected by the route's `id` param.
- Export JSON button downloads the mock job's data client-side; no export API.
- Align the status badge to the design system's `status-*` tokens (replace `StatusBadge.svelte`'s current hardcoded colors) instead of introducing a second status representation.
- Human Intervention overlay/control panel: out of scope, do not implement.

---

### Step 4 — Docs

**Guard:** `npm run guard:tools:md-links`.

**Work:**
- Run `write-agent-context` for topic `design-system`, area `hub`: file location of the copied SCSS (`src/hub/src/lib/styles/variables.scss`, `src/hub/src/lib/styles/mixins/`), the `@use` import pattern, and that `docs/design/scss` (not the app copy) is the source of truth to update first. Don't repeat rules already in [conventions.md](../../context/hub/conventions.md) (e.g. the tokens-only rule, mockup-vs-design-system precedence).
- Move the draft ADR from Step 2 into `docs/adrs/hub/`.
- Confirm every file under `docs/context/hub` is linked from `_index.md`; fix any that aren't.

---

## Out of scope

- Jobs list, Customer, and Registered Application pages/routes.
- Database, API endpoints, seed data.
- Start Training modal.
- Human Intervention overlay/control panel.
- Runner polling/integration.
- Recipe version history beyond the static mock data shown on the Job Screen.

## Traceability

- Source: [docs/todos/0002-01-pages-to-jobs.md](../../todos/0002-01-pages-to-jobs.md) item 1 "Hub Visuals"
