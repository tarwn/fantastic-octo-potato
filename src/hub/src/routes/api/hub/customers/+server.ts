import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getDb } from "$lib/server/storage/db/db";
import { listCustomers } from "$lib/server/storage/repositories/customerRepository";

export const GET: RequestHandler = () => json({ data: listCustomers(getDb()) });
