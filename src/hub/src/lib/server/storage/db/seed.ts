import type Database from "better-sqlite3";

// resetCli.ts runs this directly via `node` (outside Vite/SvelteKit), so relative imports
// need explicit extensions all the way down its dependency chain.
import { insertApplication } from "../repositories/applicationRepository.ts";
import { insertCustomerApplicationXref } from "../repositories/customerApplicationXrefRepository.ts";
import { countCustomers, insertCustomer } from "../repositories/customerRepository.ts";
import { createDraftRecipe, publishRecipe } from "../repositories/recipeRepository.ts";
import { insertRunner } from "../repositories/runnerRepository.ts";

import type { ChildStep, RecipeDefinition } from "$lib/types/recipeDefinition";

// The local target-app (docs/context/tools/target-app.md): reachable at localhost:8089, seeded
// login admin@targetapp.local / targetapp-seed-pw, one seeded invoice (INV-1001) against client
// "Contoso Consulting". Step targets below can only be literal strings, not the invoiceNumber
// input, so these hand-authored Steps navigate to the one seeded invoice by its known link text
// rather than searching for an arbitrary number.
const TARGET_APP_URL = "http://localhost:8089/";
const INVOICES_LIST_URL = "http://localhost:8089/index.php/invoices";
const SEEDED_INVOICE_LINK_TEXT = "INV-1001";

const INVOICE_NUMBER_INPUT: RecipeDefinition["inputs"] = {
	invoiceNumber: { type: "string", description: "Invoice number to look up", required: true, nullable: false, sensitive: false }
};

const LOGIN_STEPS: ChildStep[] = [
	{ id: "start", action: "open", args: [TARGET_APP_URL], intent: "Open BambooInvoice" },
	{
		id: "login_fill_user",
		action: "fill",
		args: [{ by: "css", value: "#username" }, { ref: "credential", name: "username" }],
		intent: "Enter login email"
	},
	{
		id: "login_fill_pass",
		action: "fill",
		args: [{ by: "css", value: "#password" }, { ref: "credential", name: "password" }],
		intent: "Enter login password"
	},
	{ id: "login_submit", action: "click", args: [{ by: "css", value: "#login" }], intent: "Submit login" }
];

function happyPathDefinition(): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: INVOICE_NUMBER_INPUT,
		outputs: {
			clientName: { type: "string", description: "Client name on the invoice", required: true, nullable: false, sensitive: false }
		},
		steps: [
			...LOGIN_STEPS,
			{ id: "open_invoices", action: "open", args: [INVOICES_LIST_URL], intent: "Open the Invoices list" },
			{
				id: "open_invoice",
				action: "click",
				args: [{ by: "text", value: SEEDED_INVOICE_LINK_TEXT }],
				intent: "Open the seeded invoice"
			},
			{
				id: "wait_invoice",
				action: "verify",
				args: [{ test: "visible", args: [{ by: "css", value: ".invoiceViewHold" }] }],
				intent: "Wait for invoice details to load"
			},
			{
				id: "copy_client",
				action: "read",
				args: [{ by: "css", value: ".invoiceViewHold h3" }, "text", { ref: "output", name: "clientName" }],
				intent: "Copy the client name"
			},
			{
				id: "complete",
				action: "finish",
				args: [{ test: "assigned", args: [{ ref: "output", name: "clientName" }] }],
				intent: "Confirm the client name was collected"
			}
		],
		recoveries: []
	};
}

function failingDefinition(): RecipeDefinition {
	return {
		schemaVersion: 1,
		inputs: INVOICE_NUMBER_INPUT,
		outputs: {},
		steps: [
			...LOGIN_STEPS,
			{
				// No element on this page matches, and there is no recovery for it below — a real
				// Runner run of this Recipe has nothing to fall back to and has to ask for help.
				id: "open_invoice_lookup",
				action: "click",
				args: [{ by: "css", value: "#invoice-search-button" }],
				intent: "Look up the invoice"
			},
			{
				id: "complete",
				action: "finish",
				args: [{ test: "exists", args: [{ by: "css", value: "body" }] }],
				intent: "Unreachable checkpoint"
			}
		],
		recoveries: []
	};
}

// The baseline customer/application/xref/runner are always seeded (and cleared by db:reset)
// together, so an empty customer table is a reliable proxy for "nothing seeded yet". The whole
// insert runs as one transaction so a mid-seed failure can't leave that proxy permanently wrong.
export function seed(db: Database.Database): void {
	if (countCustomers(db) > 0) {
		return;
	}
	db.transaction(() => {
		const customer = insertCustomer(db, "Acme");
		// "BambooInvoice", not a placeholder name, since the seeded Recipes below run against the
		// real local target application and need to be reachable from this same xref/Runner.
		const application = insertApplication(db, "BambooInvoice");
		const xref = insertCustomerApplicationXref(db, customer.id, application.id);
		insertRunner(db, xref.id);

		const now = new Date();
		const happyPath = createDraftRecipe(db, {
			customerApplicationXrefId: xref.id,
			name: "Read seeded invoice",
			goal: "Log in and copy the seeded invoice's client name",
			definition: happyPathDefinition(),
			sourceTrainingRunId: null,
			createdAt: now
		});
		publishRecipe(db, happyPath.id, now);

		const failing = createDraftRecipe(db, {
			customerApplicationXrefId: xref.id,
			name: "Broken invoice lookup",
			goal: "Demonstrate an unrecoverable Step reaching Intervention-Requested",
			definition: failingDefinition(),
			sourceTrainingRunId: null,
			createdAt: now
		});
		publishRecipe(db, failing.id, now);
	})();
}
