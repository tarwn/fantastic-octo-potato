import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/storage/db/db";
import { listRegisteredApplications } from "$lib/server/storage/repositories/customerApplicationXrefRepository";

export const GET: RequestHandler = () =>
	json({
		data: listRegisteredApplications(getDb()).map((registeredApplication) => ({
			id: registeredApplication.id,
			customerName: registeredApplication.customerName,
			applicationName: registeredApplication.applicationName
		}))
	});
