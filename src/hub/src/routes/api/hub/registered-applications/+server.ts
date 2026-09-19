import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { listRegisteredApplications } from "$lib/server/storage/customerApplicationXrefRepository";
import { getDb } from "$lib/server/storage/db";

export const GET: RequestHandler = () =>
	json({
		data: listRegisteredApplications(getDb()).map((registeredApplication) => ({
			id: registeredApplication.id,
			customerName: registeredApplication.customerName,
			applicationName: registeredApplication.applicationName
		}))
	});
