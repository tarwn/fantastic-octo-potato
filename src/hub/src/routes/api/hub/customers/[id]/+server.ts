import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/storage/db/db";
import { listRegisteredApplicationsByCustomerId } from "$lib/server/storage/repositories/customerApplicationXrefRepository";
import { getCustomerById } from "$lib/server/storage/repositories/customerRepository";
import type { CustomerDetail } from "$lib/types/customer";

export const GET: RequestHandler = ({ params }) => {
	const id = Number(params.id);
	const customer = Number.isNaN(id) ? undefined : getCustomerById(getDb(), id);

	if (!customer) {
		return json({ error: `Customer ${params.id} not found` }, { status: 404 });
	}

	const registeredApplications = listRegisteredApplicationsByCustomerId(getDb(), customer.id).map(
		(registeredApplication) => ({
			id: registeredApplication.id,
			applicationName: registeredApplication.applicationName
		})
	);

	return json({ data: { ...customer, registeredApplications } satisfies CustomerDetail });
};
