import type { Page } from "playwright";

import type { BlockedRequestEvent } from "../allowList.ts";
import { takeMaskedScreenshot } from "../browser/screenshotMasking.ts";
import type { RunnerConfig } from "../config.ts";
import type { ScalarValue } from "../dsl/types.ts";
import { log } from "../logger.ts";
import { reportInfo, uploadArtifact } from "../runnerClient.ts";
import { redactKnownSecrets } from "../textRedaction.ts";

// Shared by automaticLoop.ts (Recipe) and trainingLoop.ts (Training) — both drive one Job's Steps
// through the same DSL execution primitives and need the same screenshot-capture and
// blocked-request reporting glue around each Step; only how a Job's outcome/next Step is decided
// differs between the two loops.
export interface StepReportingDeps {
	config: RunnerConfig;
	jobId: number;
	artifactsUrl: string;
	page: Page;
	secrets: string[];
	blockedEvents: BlockedRequestEvent[];
}

// A failed artifact upload is not fatal to the Job's control flow — the transcript row itself is
// the durable record; the screenshot is best-effort context. `skipPiiPass` is Training-only
// (Recipe never sets it): disables the third-party PII-detection pass while the known-secrets
// scrub still always applies (screenshotMasking.ts).
export async function captureAndUploadArtifact(deps: StepReportingDeps, stepId: string, skipPiiPass = false): Promise<void> {
	try {
		const screenshot = await takeMaskedScreenshot(deps.page, deps.secrets, skipPiiPass);
		await uploadArtifact(deps.config, deps.artifactsUrl, stepId, screenshot.toString("base64"));
	}
	catch (err: unknown) {
		const rawMessage = err instanceof Error ? err.message : String(err);
		log(redactKnownSecrets(`job ${deps.jobId}: failed to capture/upload artifact for step ${stepId}: ${rawMessage}`, deps.secrets));
	}
}

// Drains every request the allowlist route handler blocked since the last drain, reporting each
// blocked subresource as its own INFO transcript row (non-fatal — the Step it happened during may
// still have succeeded). A blocked *navigation* is handed back to the caller instead of reported
// here, since it always ends the Job as its own outcome.
export async function reportBlockedRequests(deps: StepReportingDeps, stepId: string): Promise<string | undefined> {
	const events = deps.blockedEvents.splice(0, deps.blockedEvents.length);
	let navigationUrl: string | undefined;
	for (const event of events) {
		if (event.isNavigation) {
			navigationUrl ??= event.url;
			continue;
		}
		await reportInfo(deps.config, deps.jobId, redactKnownSecrets(`Step ${stepId}: blocked a disallowed-origin request to ${event.url}`, deps.secrets));
	}
	return navigationUrl;
}

export function scalarToWireValue(value: ScalarValue): string {
	return value === null ? "null" : String(value);
}
