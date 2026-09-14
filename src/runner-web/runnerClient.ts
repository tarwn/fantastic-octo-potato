import type { RunnerConfig } from "./config.ts";

export interface InitResult {
	pollIntervalSeconds: number;
	interventionTimeoutSeconds: number;
}

export async function initRunner(config: RunnerConfig): Promise<InitResult> {
	const response = await fetch(`${config.hubUrl}/api/runner/runners/${config.runnerId}/init`, {
		method: "POST",
		headers: { authorization: `Bearer ${config.runnerSharedSecret}` }
	});

	if (!response.ok) {
		const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
		throw new Error(`init failed: ${response.status} ${body?.error ?? response.statusText}`);
	}

	const body = (await response.json()) as { data: InitResult };
	return body.data;
}
