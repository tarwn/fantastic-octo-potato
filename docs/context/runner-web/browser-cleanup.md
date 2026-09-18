# Runner Browser Process Cleanup

Reference: [browserSession.ts](../../../src/runner-web/browser/browserSession.ts), [automaticLoop.ts](../../../src/runner-web/orchestrator/automaticLoop.ts), [killStrayBrowsers.ts](../../../src/runner-web/browser/killStrayBrowsers.ts)

Notable:
* Every terminal exit path of `runRecipeJobLoop` (success, failure, error, allowlist violation, Intervention timeout) closes its browser session via a single `finally` block calling `closeBrowserSession`, so a graceful stop never leaks a browser process.
* An ungraceful stop (killing the Runner process, a crash) skips that `finally` and can leave an orphaned Playwright-launched Chromium process running. `npm run clean:runner-web` finds and kills those by matching each running process's command line against Playwright's own browser cache path (`ms-playwright`), so it never touches a developer's ordinary Chrome windows.
* This is a manual, local-dev-only command — it is not wired into any guard or CI step.
* The third-party PII-detection library used in `screenshotMasking.ts` (`@redactpii/node`, see [ADR 0001](../../adrs/runner-web/0001-add-redactpii-node-pii-detection-dependency.md)) runs pure in-memory regex checks and creates no temp files or child processes, so it needs no cleanup of its own.
