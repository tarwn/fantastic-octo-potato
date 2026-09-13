# Changelog

## 0.3.0 - 2026-09-13

Hub Visuals (spec 0002): the Job Screen route renders hardcoded Execute-mode and Training-mode mock jobs (header, status/detail strip, Transcript, Results, and Goals panels) styled against the design-system SCSS tokens/mixins copied into the hub app, plus e2e coverage and hub docs for the design system.

## 0.2.0 - 2026-09-12

Infrastructure setup (spec 0001): nx-orchestrated `npm run` guard/autofix tasks across the hub, runner-web, and tools scopes; a SvelteKit hub app with SCSS support, vitest, and Playwright e2e; a runner-web entry point with a prefixed console logger and vitest coverage; husky pre-commit/pre-push hooks; and ADRs/docs for the tooling decisions made along the way.
