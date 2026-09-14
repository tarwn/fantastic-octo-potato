// Run directly by `node` (outside Vite/SvelteKit), so relative imports need explicit extensions.
import { openDb, requireDatabaseUrl } from "./connection.ts";
import { resetUserData } from "./reset.ts";
import { seed } from "./seed.ts";

const db = openDb(requireDatabaseUrl(process.env.HUB_DATABASE_URL));
resetUserData(db);
seed(db);
db.close();
