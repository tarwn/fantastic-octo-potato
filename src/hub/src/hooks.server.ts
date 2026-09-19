import { getDb } from "$lib/server/storage/db";
import { seed } from "$lib/server/storage/seed";

seed(getDb());
