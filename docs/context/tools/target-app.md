# Local target application (BambooInvoice)

Use this when you need a running, no-API "Target Application" (per [ARCHITECTURE.md](../../../ARCHITECTURE.md#overview)) to develop against with Runner or to exercise in e2e tests — a self-contained BambooInvoice instance, see [the ADR](../../adrs/tools/0000-use-bambooinvoice-in-docker-for-target-app.md) for why this app/stack was chosen.

Reference: [target-app/](../../../target-app/), [test-e2e/target-app.spec.ts](../../../test-e2e/target-app.spec.ts)

* Start: `npm run dev:target-app:up` — builds and starts the app + MySQL containers (Docker or Podman, auto-detected). Stop: `npm run dev:target-app:down`.
* Reachable at `http://localhost:8089` once both containers report healthy.
* Seeded login: `admin@targetapp.local` / `targetapp-seed-pw`.
* Seeded data: two clients ("Contoso Consulting", "Fabrikam Design") and one invoice ("INV-1001") against the first client — seeded on first boot with no manual step, via `target-app/db-init/01-schema-and-seed.sql`.
* MySQL data persists in a named Docker/Podman volume across restarts; delete the volume to reset back to the seed state.
