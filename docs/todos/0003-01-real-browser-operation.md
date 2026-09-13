# Real browser execution for Trial and Execution loop

Use the [Architecture doc](../../ARCHITECTURE.md) to fill in more of the detail as you plan.

Include `write-adr` and `write-agent-context` where relevant to each of these tasks goals, using context from the architecture doc.

Use `write-defer` when completing a task here that has an explicit, relevant defer in the architecture doc for future-looking behavior for this item.


1. Replace the Trial/Execute core loop in the Runner
   1. Add Playwright
   2. Make sure it can connect to the real target application from earlier
   3. (TODO: DSL is required at this stage) Replace the simulated action handling with browser navigation, interaction, observation, extraction, and checkpoint actions using the agreed initial DSL and stable targeting suitable for the test Target Application's legacy interface.
   4. Working Automatic Loop shared by Trial/Execute: track automatic step, resolve ingredients, execute/recover, verify Finished checkpoint conditions, report structured outputs/results, clean up, and return to polling.
   5. Hub: Seed a real draft + release Recipe against the other seeded values, able to push the Start Job button in Hub and run one of these
   6. Hub: Seed a couple release Recipe's that will fail so we can exercise that easily
      1. A step that cannot proceed or exceeds its Recipe timeout reports Intervention-Requested and keeps the same browser session open. Overlay shows the real screenshot/context; the Runner fails the job and cleans up if no human intervenes within the configured time. Manual control is delivered in M6.
   7. Start Trial and Start Job modals validate inputs and run draft/published recipes included in the starting data. Job screen displays real outputs, safe diagnostics/final screenshot, and working JSON export.
   8. Enforced destination/action policy, conservative risky-action handling, malformed-instruction rejection, limits on how long steps can wait and how many times recovery can be attempted, and clear errors when a control cannot be identified uniquely or a checkpoint fails. Collected fields alone cannot establish completion.
2. Add masking
   1. Credential masking and a third-party library to identify sensitive data for screenshot masking, with credential masking preserved in the training setting that disables broader masking only when the data is made-up or non-sensitive. Baseline redaction applies before model transmission/storage, including logs/errors/exports and input/output handling. Temporary Runner resources are cleaned up; manual local reset/cleanup is available.
   2. 
