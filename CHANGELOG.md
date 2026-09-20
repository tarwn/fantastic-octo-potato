# Changelog

## 0.12.0 - 2026-09-20

Transcript nits (spec 0012): Target values can carry a ValueRef, the Job screen labels Job type by mode and exports the Job with its definition, and Transcript rows show the Step intent with a screenshot button and a step-detail toggle. LLM-compiled draft Recipes now require an intent per Step, and the Runner reports every executed Step, including one that fails on an allowlist violation or an unexpected error, before the status change, so failures always appear in the Transcript.

## 0.11.0 - 2026-09-20

Qualify and Publish a draft Recipe (spec 0011): a draft Recipe is qualified once a Trial Job of that exact Recipe completes successfully, and the Registered Application Recipes panel and Recipe review screen show not-yet-qualified / Trial passed (linking the Trial Job) / Published / Archived state. An operator can then publish a qualified draft with a name, optionally replacing a published Recipe, which is archived and linked in one atomic transaction and drops out of the Start Job list. Jobs now carry a `name` assigned at creation (the Recipe name, or "Training Run") shown on the Job screen and Jobs listing, and Training → Trial → Publish → Execute with changed ingredients is proven end to end with zero LLM calls after training.

## 0.10.0 - 2026-09-20

Bug Fixes Batch 1 (spec 0010): Job page status colors now cover every status (including Intervention-Requested and Completed-Error), Training Runs are titled "Training Run", and the Start Job modal shows a loading state instead of a false empty state. A duplicate Step id from the LLM is retried inside the bounded LLM loop, and a failed Training Run gets a "Retry Job" button that pre-fills the Start Training modal. The Runner now reports a masked English `targetDescription` per Step, which Hub stores with `stepId`/`outcome` as separate fields and renders as e.g. `click on button(label='Save')` (`navigate to URL` for `open`), and Transcript Steps with a screenshot open a viewer overlay that the final-screenshot panel reuses via "View larger".

## 0.9.0 - 2026-09-19

Training Run (spec 0009): an operator can start a Training Run from a Registered Application with just a goal, starting URL, and step limit — Hub calls an OpenAI-scheme LLM to turn the goal into typed Ingredients, then drives per-step discovery by sending the goal, transcript, and masked screenshot to the LLM for one next DSL Step at a time, all validated with bounded correction retries. runner-web's new Training loop executes each Hub-issued Step against a real Playwright browser, mirroring the Recipe Job loop's execution/masking but staying Hub-authoritative for progression. On success, Hub compiles the run's actual observed path into a validated draft Recipe (never a synthesized alternate branch); the Registered Application and Job screens surface a draft Recipe with "Start Trial" and link it back to the Training Job that produced it.

## 0.8.0 - 2026-09-17

Runner Masking (spec 0008): known-secrets masking now grows mid-Job as declared-sensitive Recipe outputs are extracted, and the same redaction pass scrubs every Hub-bound `INFO`/status/error message and local log line, not just screenshots. Screenshots additionally get a second, independent masking pass using `@redactpii/node` to catch on-screen PII the Runner has no advance knowledge of (email, SSN, credit card, phone patterns). Every terminal Job exit path cleans up its browser session, and a new `npm run clean:runner-web` command clears stray Runner-launched browser processes left behind by an ungraceful stop.

## 0.7.0 - 2026-09-17

Recipe Execution / Real Browser Trial-Execute Loop (spec 0007): runner-web drives a real Playwright Chromium browser against the target application to run a persisted Recipe's Steps DSL, replacing the scripted-step stand-in for Trial/Execute Jobs. Hub stores immutable Recipe definitions and dispatches the full runner payload (definition, ingredients, controls, timeouts); runner-web's shared Automatic Loop executes each Step, resolves recoverable scenarios, enforces the exact outcome mapping (`Completed-Success`/`Completed-Failed`/`Intervention-Requested`/`Completed-Error`), and captures masked per-Step screenshots. Hub's Start Trial/Start Job modals validate Ingredients against the Recipe's declared inputs and flag irreversible Steps, and the Job screen shows real transcript/outputs/screenshot with JSON export — all proven end-to-end against the local BambooInvoice target app.

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
