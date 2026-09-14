import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/db/db";
import { listCustomers } from "$lib/server/repositories/customerRepository";

export const GET: RequestHandler = () => json({ data: listCustomers(getDb()) });
