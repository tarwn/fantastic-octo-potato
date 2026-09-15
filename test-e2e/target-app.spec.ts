import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

const TARGET_APP_DIR = path.resolve(import.meta.dirname, "..", "target-app");
const TARGET_APP_URL = "http://localhost:8089";
const SEEDED_LOGIN = { username: "admin@targetapp.local", password: "targetapp-seed-pw" };
const SEEDED_CLIENT_NAME = "Contoso Consulting";

test.describe("target application (spec 0005)", () => {
	// Building the image and initializing MySQL from a cold cache can take several
	// minutes; the default 30s test/hook timeout is nowhere near enough.
	test.describe.configure({ timeout: 300_000 });

	test.beforeAll(() => {
		execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "up"], { stdio: "inherit" });
	});

	test.afterAll(() => {
		execFileSync(process.execPath, [path.join(TARGET_APP_DIR, "run-compose.mjs"), "down"], { stdio: "inherit" });
	});

	test("starts populated with seed data and is reachable over HTTP", async ({ request }) => {
		// The app container's own healthcheck already gates readiness on a successful HTTP
		// response (see target-app/Dockerfile); poll it directly here rather than parsing
		// `docker`/`podman inspect` health status, since the CLI output differs between them.
		await expect
			.poll(async () => (await request.get(`${TARGET_APP_URL}/`)).status(), { timeout: 60_000, intervals: [2_000] })
			.toBeLessThan(400);

		const rootResponse = await request.get(`${TARGET_APP_URL}/`);
		expect(rootResponse.status()).toBe(200);

		// The seeded client only appears once logged in (BambooInvoice has no public,
		// unauthenticated screens with data on them), so log in with the seeded admin
		// account before checking for seed data.
		const loginResponse = await request.post(`${TARGET_APP_URL}/index.php/login`, { form: SEEDED_LOGIN });
		expect(loginResponse.status()).toBe(200);

		const dashboardBody = await loginResponse.text();
		expect(dashboardBody).toContain(SEEDED_CLIENT_NAME);
	});
});
