---
name: verify-ui
description: Visually verify a UI change to Hub with a throwaway Playwright spec
---

1. Write a temporary spec at `src/hub/e2e/tmp-verify.spec.ts`
2. Use seeder.ts for any new data setup
3. For layout/overflow assertions use scrollWidth/clientWidth via page.evaluate — NEVER boundingBox.
4. Dismiss any beforeunload dialog with page.on('dialog', d => d.accept()).
5. Run: `npx playwright test src/hub/e2e/tmp-verify.spec.ts --reporter=line`
6. Report pass/fail, then DELETE `src/hub/e2e/tmp-verify.spec.ts` and confirm deletion.
