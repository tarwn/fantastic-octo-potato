import type Database from "better-sqlite3";

// resetCli.ts runs this directly via `node` (outside Vite/SvelteKit), so relative imports
// need explicit extensions all the way down its dependency chain.
import { insertApplication } from "../repositories/applicationRepository.ts";
import { insertCustomerApplicationXref } from "../repositories/customerApplicationXrefRepository.ts";
import { countCustomers, insertCustomer } from "../repositories/customerRepository.ts";
import { insertRunner } from "../repositories/runnerRepository.ts";

// The baseline customer/application/xref/runner are always seeded (and cleared by db:reset)
// together, so an empty customer table is a reliable proxy for "nothing seeded yet". The whole
// insert runs as one transaction so a mid-seed failure can't leave that proxy permanently wrong.
export function seed(db: Database.Database): void {
	if (countCustomers(db) > 0) {
		return;
	}
	db.transaction(() => {
		const customer = insertCustomer(db, "Acme");
		const application = insertApplication(db, "Widgets");
		const xref = insertCustomerApplicationXref(db, customer.id, application.id);
		insertRunner(db, xref.id);
	})();
}
