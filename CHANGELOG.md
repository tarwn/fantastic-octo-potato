# Changelog

## 0.6.0 - 2026-09-16

Runner Main Loop and Hub Job Queue (spec 0006): Hub persists real Training Jobs (`job`/`job_status`/`job_transcript_entry`/`job_result`), the Start Training modal creates one and atomically hands it to a matching Runner on poll, runner-web runs a job-aware main loop that reports each scripted step and reacts to Hub's next-step/terminal-status response, and the Jobs list/detail UI (with a shared `RefreshIndicator` component) and Runner activity now read real data instead of `mockJobs.ts` — proven end-to-end by a new multi-service Playwright guard covering claim, transcript growth, completion, ownership, and cancellation.

## 0.5.0 - 2026-09-14

Runner Polling (spec 0004): runner-web reads its Hub URL, runner id, and shared bearer secret from `.env`, connects to Hub's `/api/runner/*` init endpoint on startup, then loops on a poll endpoint at the interval Hub returns while Hub tracks each runner's heartbeat and shows it as "alive"/"idle" on the Registered Application page — proven end-to-end by a new multi-service Playwright guard.

## 0.4.0 - 2026-09-14

Hub Data Foundation (spec 0003): hub persists Customer, Application, Runner, and Recipe data in SQLite via dbmate migrations and a startup seed, exposes read APIs, and adds Customers/Registered Applications/Jobs list-and-detail pages plus a Start Training modal with client-side validation — the Job Screen itself is unchanged.

## 0.3.0 - 2026-09-13

Hub Visuals (spec 0002): the Job Screen route renders hardcoded Execute-mode and Training-mode mock jobs (header, status/detail strip, Transcript, Results, and Goals panels) styled against the design-system SCSS tokens/mixins copied into the hub app, plus e2e coverage and hub docs for the design system.

## 0.2.0 - 2026-09-12

Infrastructure setup (spec 0001): nx-orchestrated `npm run` guard/autofix tasks across the hub, runner-web, and tools scopes; a SvelteKit hub app with SCSS support, vitest, and Playwright e2e; a runner-web entry point with a prefixed console logger and vitest coverage; husky pre-commit/pre-push hooks; and ADRs/docs for the tooling decisions made along the way.
