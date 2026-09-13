# Training Run: POC contract

An extending discovery plan that eventually produces a draft [Recipe](./recipe.md). Uses the [POC DSL](./steps-dsl.md); see [./examples](examples.json).

## Hub record

| Field | Purpose |
| --- | --- |
| schemaVersion, id, jobId | Contract and associated Training Job |
| customerId, applicationId, createdAt | Scope/provenance |
| goal, alternateGoals | Extraction goal and additional discovery goals |
| startUrl, controls | Starting URL and allowlist |
| maxSteps, stepTimeoutMs | Training cap and single default Job step timeout |
| masking, syntheticDataConfirmed? | Standard masking, or confirmed synthetic data; credentials always masked |
| inputSamples, outputSamples | Available flat sample values |
| hypotheses | Input/output/recovery/selector learnings |
| steps | Append-only {sequence,source,step} instructions |
| transcript | Observed INFO, STEP, and STATUS events |
| artifacts | Masked screenshot/error-artifact references |
| compiledRecipe? | Resulting {id,version} after draft persistence |

Job status, assigned Runner, heartbeat, and interactive-user ownership remain on the Job, not duplicated as Training lifecycle fields.

A hypothesis is `{id,kind,statement,status,evidenceEventIds,fieldName?,field?}`. Status is proposed, confirmed, or rejected. Input/output hypotheses carry a field declaration; observations support them without turning a sample into a universal constraint.

## Runner exchange

The initial payload needs Job ID, schemaVersion, starting open Step, available training Ingredients, controls, stepTimeoutMs, and masking settings. Subsequent messages supply the next validated Step and any new Ingredients it needs. The runner never receives the whole Hub discovery record.

For each executed Step, return its ID, outcome, screenshot/artifact references, selector suggestions, and extracted value/sensitivity where relevant. Every group/if child returns its own STEP event with parentStepId. A failing child remains the resume target; handback can select that child without replaying its siblings. Artifact coordinates refer to the full-page image, including scrollable content, as described in the DSL.

The Hub appends observed transcript events separately from proposed instructions. It sends the goal, summarized transcript, current masked screenshot, reference names, and POC vocabulary to the LLM. Credential values stay on the runner; sensitive samples are masked in LLM/transcript projections.

## Completion

1. Append and execute the initial open, then validate/append each next LLM or human Step.
2. Register provisional output declarations as training discovers fields. A Recipe later requires declarations for every destination.
3. Stop at terminal Job status or maxSteps. Count executable child Steps too, so grouping does not bypass the cap; group/if wrappers do not consume an extra action count. finish at the cap can succeed; otherwise reaching the cap fails.
4. Training finish may use null because no final checkpoint exists yet.
5. On Completed-Success, compile actual observed paths, inputs/outputs, alternate endings, and recoveries into a draft Recipe with explicit checkpoints. Set compiledRecipe only after saving it.

Trial/Execute observations belong to their own Job transcripts. Compilation failure can be reported without changing an already-successful Training Job's execution result.

The [architecture](../../../ARCHITECTURE.md) remains authoritative. Advanced execution budgets, richer hypotheses/projections, retention automation, and automatic intervention-to-Recipe improvement are outside this POC.
