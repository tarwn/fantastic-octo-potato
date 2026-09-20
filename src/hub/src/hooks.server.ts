import { getDb } from "$lib/server/storage/db/db";
import { seed } from "$lib/server/storage/db/seed";

seed(getDb());
