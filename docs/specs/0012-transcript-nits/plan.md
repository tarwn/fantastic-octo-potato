This is the plan for [0012-transcript-nits/spec.md](./spec.md).

- [x] 1. ValueRef in Target values + seed fix
- [x] 2. Job screen: type label and export with definition
- [x] 3. Transcript row: layout, intent, screenshot button, toggle
- [x] 4. Require intent on LLM-compiled draft Recipes
- [x] 5. DEFER records
- [x] 6. Bug: when the runner fails an "open" step due to an allowlist violation, it only reports a STATUS change and fails to first report the STEP with an outcome failure. Every step that is executed must be reported to the Hub/Transcript even if that step is a failure that will also be immediately performing a status change (error, failed, intervention-requested, etc)
- [ ] 7. Bug: when `executeAction` throws an unexpected error, the Step is likewise not reported before the Completed-Error status (Recipe and Training loops). Needs a decision on what `targetDescription` to send, since none is available.
