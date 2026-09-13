// Run directly by `node` (outside Vite/SvelteKit), so relative imports need explicit extensions.
import { openDb, requireDatabaseUrl } from "./connection.ts";
import { resetUserData } from "./reset.ts";

const db = openDb(requireDatabaseUrl(process.env.HUB_DATABASE_URL));
resetUserData(db);
// Re-seeding the baseline rows is wired in once Step 4 adds the seed function.
db.close();
