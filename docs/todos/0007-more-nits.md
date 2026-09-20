

- When a click is sent with an x,y target, add an extra transcript row for "Observe" with a message that repeats the selector suggestion from the dslStep in text, if there was one

- The icons on the transcript rows for screenshots need to be the rightmost item on the row, use a simpler icon or emoji, need to be a subtler grey or slate color by about 10-20%, need to be larger for more click area (consider a negative margin if needed but don't make them as large as the row height)

- JSON Export button on job: expand the JSON exported to
  - Trial/Execute: { recipe: {...}, transcript: { ...current export... } }
  - Training Run: { run: {...steps/ingredients...}, transcript: { ...current export... } }

- Bug: seeded recipes should ref the invoice id input instead of hard-coded INV-1001 text in the recipe steps

- update the transcript row to display as: time, kind, text, |gap|, [status badge], [screenshot button]

- update the transcript row text to display the step intent instead of stepMessage(step), keep the display of input/output via transcriptStepField

- Add a small toggle icon to the rightmost side of the trancript row (order should now be time, kind, text, |gap|, [status badge], [screenshot button], [toggle])
  - every row gets a toggle
  - when pressed, the toggle expands the transcript row to show more detail
    - top visible row stays the same
    - new area (these rows have same background color as the row, indented to start displaying text event with the text element of the top row + extra padding to visibly indent in, $space-l perhaps)
      - 1st row: id:{stepId}        outcome: {outcome}
      - 2nd row: recipe step: <StepDescription /> by looking the step up from the recipe by step id
      - 3rd row: observed: stepMessage(step)

Add DEFER pages for:
  - pretty 404 and 500 pages, nice messages for unexpected API 404 calls (job id not found) - these were deferred due to the POC state of this system and ease that they could be added later
  - "plan" kind for the transcript was deferred, this is intended to be an additional planning stage from the LLM twhere it sets mini-goals between a series of steps to tell us what it is doing, but was deferred functionality and we use just the goals we have defined without mini-goals when producing steps and recipes from the LLM
  - "observe" kind for the transcript has been deferred, there are mini observations tracked for each STEP already, this was intended to be a kind for raising specifci observations from the runner as potential better selectors than the one the plan already had (especially useful for training or for compiling human observation runs into a new draft recipe). Deferred because it doesn't appear necessary for the POC goal and the supporting observation parts will provide value on their own even without this


- Instead of JobType at the top (Training Run vs Recipe) we were supposed to see Training Run, Trial, or Execute types. This was present at some point but lost somewheer along the way. This is important because a Trial job may opt into showing more detail than default than an Execute job on the job screen later.
