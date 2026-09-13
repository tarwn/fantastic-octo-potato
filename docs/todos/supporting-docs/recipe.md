# Recipe: POC contract

A fixed extraction program for one Customer × Application. Depends on the [POC DSL](./steps-dsl.md); [examples](./examples.json) provide concrete shapes.

## Hub record versus runner payload

| Hub Recipe record | Purpose |
| --- | --- |
| id, version | Stable Recipe revision referenced by Jobs |
| customerId, applicationId | Scope |
| name, goal | Human description |
| state | draft or published |
| createdAt, publishedAt? | Lifecycle dates |
| sourceTrainingRunId | Training provenance |
| definition | Reusable runner program below |

Only definition, required Recipe identity, Ingredients, and Job controls go to the runner:

```text
{jobId, mode, recipeId, recipeVersion, recipe: definition,
 ingredients, controls, stepTimeoutMs, comms}
```

The definition is `{schemaVersion,inputs,outputs,steps,recoveries}`. Recovery entries are `{id,description,when,steps}`; no maxUses, retry/skip policy fields, digests, or acknowledgment records. The Job supplies one default stepTimeoutMs. Hub scope/lifecycle/provenance fields are not part of the runner program.

Jobs reference a Recipe revision. Database updates permit only lifecycle fields; executable definition stays immutable once used. Training creates a draft; Start Trial includes the human review required by the architecture. A successful Trial makes Publish available, and Publish is explicit. Eligibility is a query of Jobs for this revision with mode Trial and status Completed-Success; there is no stored successfulTrial copy to keep synchronized or retain after Job deletion.

## Inputs, Ingredients, and outputs

A field declaration is:

```json
{"type":"string","description":"Account to search for","required":true,"nullable":false,"sensitive":true}
```

Types are string, number, boolean. Fields are flat; optional enum restricts values. No date type or format. Required nullable fields must still be assigned. Validate types, required fields, nullable values, enums, and unknown fields at dispatch and completion.

Ingredients supply declared inputs; credentials are named runner-local bindings. Customer and Job inputs are merged by the Hub before dispatch. Examples:

```json
{"startUrl":"https://legacy.example.test/accounts","accountQuery":"ACCT-1042"}
```

```json
{"status":"found","accountNumber":"ACCT-1042","balance":1234.5,"statementDate":"09/01/2026"}
```

```json
{"status":"not_found","accountNumber":null,"balance":null,"statementDate":null}
```

The Recipe reads statementDate as a raw string. The result envelope may carry runnerTimezone (for example America/New_York) separately from outputs; that records runner context, not a date conversion or inferred application timezone.

## Program and completion

Main Steps include happy paths and expected alternate endings. An expected “No results” branch assigns not_found and null values, then reaches finish successfully. Recoveries handle incidental UI interruptions, such as dismissing a popup, using the DSL's simple resume rule.

The starting open can reference input.startUrl. The Job separately supplies the URL allowlist and callbacks. Runner authentication, ownership, heartbeat, status, and intervention control belong to the Job protocol.

Every Recipe finish has a non-null checkpoint and validates outputs before Completed-Success. Unmet completion/action requirements request intervention; unexpected technical/allowlist errors are Completed-Error. Intentional sensitive results go to the Hub Results store; transcript/LLM projections mask them. No LLM generates new Steps during Trial/Execute.

See [ARCHITECTURE.md](../c../../ARCHITECTURE.md) for the lifecycle; deferred expansion is in the [extended DSL](./steps-dsl-extended.md).
