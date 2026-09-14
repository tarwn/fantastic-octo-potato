import { getDb } from "$lib/server/db/db";
import { seed } from "$lib/server/db/seed";

seed(getDb());
