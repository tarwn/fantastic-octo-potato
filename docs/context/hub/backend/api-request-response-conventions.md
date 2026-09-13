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
