# Scenario API request/response conventions

Use this pattern when adding or extending a REST-ish resource route under `src/hub/src/routes/api/hub` or `src/hub/src/routes/api/runner`

Reference: (Coming Soon)

* Routing:
    - `/api/{app}/{plural-noun}` indicates a collection of items
    - `/api/{app}/{plural-noun}/[id]` indicates a single item, a GET gets the full model, a POST or PUT is an all-or-nothing field update that expects all client-editable fields in each call
    - `/api/{app}/{plural-noun}/[id]/{verb}` indicates a specific action on a single item
* GET is used to fetch data:
    * success returns an envelope, `{ data: T } | { data: Array<T> }`, not a bare item or array
    * errors, such as 404, return `{ error: ... }`
* `PUT`/`POST` are used to create/update data:
    * server-generated data is never accepted in client payloads, for instance an `id` field on a new resource would be managed by the server and not sent (not even with default/0/null values) from the frontend
    * success returns the full saved model after the changes are applied, with a `201`/`200` status — the frontend never has to re-fetch after a mutation.
    * errors, such as 404, return `{ error: ... }`
* Validation happens before applying data to backend data stores
* Status codes — pick one from this table rather than choosing ad hoc:

| Code | Meaning | Example |
|---|---|---|
| 200 | Success (GET, or POST/PUT that doesn't create) | `poll`/`steps` returning a Job's current state |
| 201 | Success, resource created (POST) | Creating a Job or Runner |
| 400 | Validation failed on the request body/params | Missing `goal`, invalid `startingUrl` |
| 401 | Missing/invalid bearer auth | Runner endpoints without a matching `Authorization` header |
| 403 | Authenticated, but not the owner of the resource | A Runner calling `steps` on a Job assigned to a different `runner_id` |
| 404 | Resource does not exist | Unknown Job/Runner/Registered Application id |
| 409 | Request conflicts with the resource's current state | Cancelling an already-terminal Job |
