import { json } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { listCustomers } from "$lib/server/storage/customerRepository";
import { getDb } from "$lib/server/storage/db";

export const GET: RequestHandler = () => json({ data: listCustomers(getDb()) });
