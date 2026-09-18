# Spec 0008: Runner Masking

## Goal

For Trial/Execute Jobs: no known secret (credential or declared-sensitive input/output) reaches a screenshot, a Hub-bound message, or a local log line; no unrecognized on-screen PII reaches a screenshot; and every temporary resource a Job creates is gone once the Job ends.

## Requirements

- R001: Screenshots mask known secrets (credentials + declared-sensitive inputs) — already implemented — and are extended to mask declared-sensitive Recipe *outputs* once extracted mid-Job, not just values known before the Job starts.
- R002: Screenshots additionally mask on-screen values the Runner has no advance knowledge of, using a third-party PII-detection library (e.g. email, SSN, credit card, phone patterns), per ARCHITECTURE.md's Core Loop.
- R003: The same known-secrets scrub already used for screenshots is applied to every other outbound Runner message that could carry them — `INFO`/status/error text sent to Hub and local process log lines — before it leaves the process or is written locally, per ARCHITECTURE.md's Data Privacy section and the `Completed-Failed`/`Completed-Error` transcript detail note ("sensitive data masked").
- R004: Every terminal exit path (success, failure, error, allowlist violation, intervention timeout) leaves no leftover temporary resource (browser session/process, any scratch file the PII-detection step creates) behind; a manual local command exists to clear stray resources during development.

## Constraints

- C001: Credential masking cannot be weakened or bypassed by whatever mechanism does the broader PII detection — it must remain a separate, always-applied pass.
- C002: Hub does not re-mask or re-inspect screenshot bytes — the Runner stays the sole trust boundary for screenshot content (unchanged from today).
- C003: New production dependency (PII-detection library) requires a `write-adr`.
- C004: ARCHITECTURE.md documents a Training-only "masking disable" setting for confirmed synthetic data; Training Jobs are not implemented yet (see [0004-01-training.md](../../todos/0004-01-training.md)), so there is no consumer for that setting today — out of scope here (see below).

## Sequencing

No user-observable (Hub UI) behavior changes — all of this is internal to Runner's message/screenshot construction. Guards are unit/integration tests in `src/runner-web`, no new e2e coverage needed. Step 2 lands the new dependency + ADR before Step 1's redaction utility is reused inside it, so do Step 1 first, Step 2 second, Step 3 (cleanup) last since it only needs to account for whatever Step 2 introduces.

---

### Step 1 — Extend known-secrets masking to mid-Job outputs and to Hub-bound messages/local logs

**Guard:** `screenshotMasking.test.ts` case: a declared-sensitive output's value, extracted mid-run, is masked in a screenshot taken *after* extraction. New unit tests on a redaction helper: masks a known secret embedded in an arbitrary string, no-ops on strings without one. `automaticLoop.test.ts` cases: an error/status message and a local `log()` line that would have contained a secret are redacted before being sent/logged.

**References**
- [recipe-automatic-loop.md](../../context/runner-web/recipe-automatic-loop.md)
- `src/runner-web/orchestrator/automaticLoop.ts` (`collectSecretValues`, `deps.secrets`, `reportStatus`/`reportInfo`/`log` call sites)
- `src/runner-web/dsl/outputsState.ts` (where extracted output values land)
- `src/runner-web/browser/screenshotMasking.test.ts`

**Work:**
- Grow `deps.secrets` as declared-sensitive outputs are extracted during the run (Recipe's `outputs[name].sensitive`, mirroring the existing `recipe.inputs[name].sensitive` check in `collectSecretValues`).
- Extract the known-secrets scrub (currently inline in `takeMaskedScreenshot`'s string-matching) into a small text-redaction helper usable outside a `page.evaluate` context.
- Apply that helper to every string handed to `reportStatus`, `reportInfo`, and `log(...)` in `automaticLoop.ts` (and any other Runner call site building Hub-bound or local text from a caught error/outcome message).

---

### Step 2 — Third-party PII detection for unknown on-screen sensitive data

**Guard:** `screenshotMasking.test.ts` case: an element whose text matches a PII pattern (not in the known-secrets list) is masked; an element with ordinary non-sensitive text is not.

**References**
- ARCHITECTURE.md, Core Loop → Notable Specifics #2
- `src/runner-web/browser/screenshotMasking.ts`
- `docs/adrs/runner-web/_index.md`, `docs/adrs/runner-web/0000-production-playwright-browser-driving-dependency.md` (ADR precedent for a runner-web production dependency)

**Work:**
- Research and pick a lightweight, pattern/regex-based PII-detection library that runs in Node (not inside the browser's page context) against page text pulled out via `page.evaluate`, then reuse the existing overlay-injection mechanism to mask matching elements — avoids bundling an ML/native dependency into the Runner or the page. Evaluate OpenRedaction as one candidate (user-specified, see Open questions).
- `write-adr` for the library choice.
- Wire the detector into `takeMaskedScreenshot` (or a wrapping call in `automaticLoop.ts`) as a second, independent masking pass alongside the known-secrets pass from Step 1 (C001: this pass never replaces or gates the known-secrets pass).

---

### Step 3 — Temporary resource cleanup

**Guard:** integration test/manual check confirming no browser process or scratch file (including anything Step 2's detector writes) survives past every terminal exit path already covered by `closeBrowserSession`'s `finally`.

**References**
- `src/runner-web/browser/browserSession.ts`
- `src/runner-web/orchestrator/automaticLoop.ts` (`runRecipeJobLoop`'s `finally`)

**Work:**
- Confirm the PII-detection library from Step 2 introduces no persistent temp files/processes; if it does, clean them up in the same `finally` block that already closes the browser session.
- Add a manual `npm run` command for local dev to clear any stray Runner-launched browser processes left behind by an ungraceful stop (crash, kill), documented in `docs/context/tools/*` or `docs/context/runner-web/*` as appropriate.

---

### Step 4 — Docs

**Guard:** `npm run guard:tools:md-links`

**Work:**
- Move Step 2's draft ADR into `docs/adrs/runner-web/`, add it to `docs/adrs/runner-web/_index.md`.
- Update [recipe-automatic-loop.md](../../context/runner-web/recipe-automatic-loop.md) to note the two independent masking passes (known-secrets, PII-detection) and that the same known-secrets scrub applies to Hub-bound messages and local logs, not just screenshots.
- `write-defer` for the Training-only masking-disable setting (C004), so it's picked up when Training Jobs are built.

---

## Out of scope

- Running the PII-detection library (R002) against Hub-bound messages/local logs — ARCHITECTURE.md scopes that library to screenshot masking only ("prior to taking a screenshot"), and `training-run.md`'s "Standard masking" vs. "credentials always masked" distinction confirms "baseline redaction" (R003) means the known-secrets scrub, not the broader PII pass.
- The Training-mode "masking disable for confirmed synthetic data" setting (ARCHITECTURE.md's Data Privacy section, `training-run.md`'s `masking, syntheticDataConfirmed?`) — Training Jobs don't exist yet; see C004.
- Hub-side re-masking or inspection of screenshot bytes (Runner remains the sole trust boundary, C002).
- Encrypting output values in transit/storage (existing ARCHITECTURE.md FUTURE item, unrelated to masking).
- Any change to how Hub already masks declared-sensitive output *values* for display/export (`maskValue` in `jobRepository.ts`) — that path is already correct and untouched here.

## Traceability

- Source: [docs/todos/0003-01-real-browser-operation.md](../../todos/0003-01-real-browser-operation.md), item 2 ("Add masking")

## Open questions for the user

1. Step 2: any preferred/disallowed PII-detection library, or should the implementor choose and record the reasoning in the ADR?
   User Answer: No mandate — implementor researches and chooses in the ADR, but must include OpenRedaction as one of the evaluated candidates.
