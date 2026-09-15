import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

// Red until Step 5 (runner-web's job-aware main loop) lands — see docs/specs/0006-job-queue/spec.md.
// Steps 2-4 (schema/repositories, Hub APIs, Hub UI) haven't landed yet either, so every API call
// below 404s/fails until this whole spec is implemented; that's expected per the plan's sequencing.

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "..");
// hub's own nx targets (build/preview/db-reset) run with cwd src/hub, so the sqlite path in
// HUB_DATABASE_URL resolves there, not against the repo root.
const DB_PATH = path.join(WORKSPACE_ROOT, "src", "hub", ".data", "hub.e2e.db");
const RUNNER_SHARED_SECRET = "test-e2e-shared-secret";

// The baseline seeded Runner (seed.ts): Acme/Widgets, runner id 1.
const PRIMARY_RUNNER_ID = "1";

// Step 3's scripted-step stand-in is goal/value-agnostic dev fixture content, not something this
// guard can read from Hub's source — this test pins the exact canned steps Step 3 must hardcode so
// the assertions below (and the Runner's console output) have something concrete to check against.
const SCRIPTED_STEP_1_TEXT = "navigate to starting URL";
const SCRIPTED_STEP_2_TEXT = "extract sample_field";
const SCRIPTED_RESULT_FIELD = "sample_field";
const SCRIPTED_RESULT_VALUE = "sample-value";

interface RegisteredApplicationSummary {
	id: number;
	customerName: string;
	applicationName: string;
}

interface JobDetail {
	id: number;
	status: string;
	transcript: { sequence: number; kind: string; text: string }[];
	results: { fieldName: string; value: string }[];
}

// No create-customer/application/runner API exists yet, so a second Runner on a different
// Customer x Application (needed to prove xref isolation) is seeded directly against the same
// sqlite file the e2e webServer points at (see test-e2e/playwright.config.ts).
function seedSecondRunner(): { runnerId: string } {
	const db = new Database(DB_PATH);
	try {
		const customerId = Number(
			db.prepare("INSERT INTO customer (name) VALUES (?)").run("Globex").lastInsertRowid
		);
		const applicationId = Number(
			db.prepare("INSERT INTO application (name) VALUES (?)").run("Gadgets").lastInsertRowid
		);
		const xrefId = Number(
			db
				.prepare("INSERT INTO customer_application_xref (customer_id, application_id) VALUES (?, ?)")
				.run(customerId, applicationId).lastInsertRowid
		);
		const runnerId = Number(
			db
				.prepare("INSERT INTO runner (customer_application_xref_id, last_heartbeat_on) VALUES (?, NULL)")
				.run(xrefId).lastInsertRowid
		);
		return { runnerId: String(runnerId) };
	}
	finally {
		db.close();
	}
}

function spawnRunner(baseURL: string, runnerId: string, output: string[]): ChildProcess {
	const runner = spawn(process.execPath, ["--watch", "src/runner-web/index.ts"], {
		cwd: WORKSPACE_ROOT,
		env: {
			...process.env,
			HUB_URL: baseURL,
			RUNNER_ID: runnerId,
			RUNNER_SHARED_SECRET
		}
	});
	runner.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
	runner.on("error", (err) => output.push(`[test] failed to spawn runner-web: ${err.message}`));
	return runner;
}

test("full Job lifecycle: claim, transcript, completion, ownership, and cancellation", async ({
	request,
	page,
	baseURL
}) => {
	if (!baseURL) {
		throw new Error("baseURL is not set");
	}

	const { runnerId: SECOND_RUNNER_ID } = seedSecondRunner();

	const registeredApplications = await (await request.get("/api/hub/registered-applications")).json();
	const widgets = (registeredApplications.data as RegisteredApplicationSummary[]).find(
		(app) => app.applicationName === "Widgets"
	);
	if (!widgets) {
		throw new Error("seeded Widgets registered application not found");
	}

	const output: string[] = [];
	const runner = spawnRunner(baseURL, PRIMARY_RUNNER_ID, output);

	try {
		// Create a Training Job scoped to the seeded Registered Application; it starts Pending.
		const createResponse = await request.post(`/api/hub/registered-applications/${widgets.id}/jobs`, {
			data: { goal: "Learn the thing", startingUrl: "https://teller.northwind.test/start", maxSteps: 5 }
		});
		expect(createResponse.status()).toBe(201);
		const { data: created } = (await createResponse.json()) as { data: { id: number; status: string } };
		expect(created.status).toBe("Pending");

		const jobId = created.id;
		const jobDetailUrl = `/api/hub/jobs/${jobId}`;

		// A Runner on a different Customer x Application never sees this Job on poll.
		const otherRunnerPoll = await request.post(`/api/runner/runners/${SECOND_RUNNER_ID}/poll`, {
			headers: { authorization: `Bearer ${RUNNER_SHARED_SECRET}` }
		});
		expect((await otherRunnerPoll.json()).data.hasWork).toBe(false);

		// ...and a direct steps call against this Job id is rejected as not its owner.
		const otherRunnerSteps = await request.post(`/api/runner/runners/${SECOND_RUNNER_ID}/jobs/${jobId}/steps`, {
			headers: { authorization: `Bearer ${RUNNER_SHARED_SECRET}` },
			data: { sequence: 1, kind: "step", text: "should not be accepted" }
		});
		expect(otherRunnerSteps.status()).toBe(403);

		// The matching Runner claims it on its next poll.
		await expect
			.poll(async () => ((await (await request.get(jobDetailUrl)).json()) as { data: JobDetail }).data.status, {
				timeout: 15_000
			})
			.toBe("Running");

		// Transcript entries accumulate, visible on the Job screen without a manual reload assumption
		// beyond normal navigation.
		await expect
			.poll(
				async () => {
					await page.goto(`/jobs/${jobId}`);
					return page.getByText(SCRIPTED_STEP_1_TEXT).isVisible();
				},
				{ timeout: 15_000 }
			)
			.toBe(true);
		await expect
			.poll(
				async () => {
					await page.goto(`/jobs/${jobId}`);
					return page.getByText(SCRIPTED_STEP_2_TEXT).isVisible();
				},
				{ timeout: 15_000 }
			)
			.toBe(true);

		// The scripted sequence finishes within budget: Completed-Success, with the extracted result
		// recorded, and the Runner's console shows it returning to polling.
		await expect
			.poll(
				async () => {
					const body = (await (await request.get(jobDetailUrl)).json()) as { data: JobDetail };
					return body.data;
				},
				{ timeout: 15_000 }
			)
			.toEqual(
				expect.objectContaining({
					status: "Completed-Success",
					results: expect.arrayContaining([
						expect.objectContaining({ fieldName: SCRIPTED_RESULT_FIELD, value: SCRIPTED_RESULT_VALUE })
					])
				})
			);

		await expect
			.poll(() => (output.join("").match(/poll: hasWork=false/g) ?? []).length, { timeout: 15_000 })
			.toBeGreaterThanOrEqual(1);

		// Cancel a second Job while the same Runner is assigned to it.
		const secondCreateResponse = await request.post(`/api/hub/registered-applications/${widgets.id}/jobs`, {
			data: { goal: "Learn the thing again", startingUrl: "https://teller.northwind.test/start", maxSteps: 5 }
		});
		const { data: secondCreated } = (await secondCreateResponse.json()) as { data: { id: number } };
		const secondJobDetailUrl = `/api/hub/jobs/${secondCreated.id}`;

		await expect
			.poll(async () => ((await (await request.get(secondJobDetailUrl)).json()) as { data: JobDetail }).data.status, {
				timeout: 15_000
			})
			.toBe("Running");

		const cancelResponse = await request.post(`/api/hub/jobs/${secondCreated.id}/cancel`);
		expect(cancelResponse.status()).toBe(200);

		await expect
			.poll(async () => ((await (await request.get(secondJobDetailUrl)).json()) as { data: JobDetail }).data.status, {
				timeout: 15_000
			})
			.toBe("Completed-Cancelled");

		await expect
			.poll(() => (output.join("").match(/poll: hasWork=false/g) ?? []).length, { timeout: 15_000 })
			.toBeGreaterThanOrEqual(2);
	}
	finally {
		runner.kill();
	}
});
