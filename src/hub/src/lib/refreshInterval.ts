import { isTerminalJobStatus, type JobStatus } from "./jobStatus";

export const REFRESH_INTERVAL_SECONDS = 5;
export const FAST_REFRESH_INTERVAL_SECONDS = 1;
const STALE_JOB_MS = 6 * 60 * 60 * 1000;

// A Job that is finished, or has not reported anything for hours, is not going to change soon
// enough to be worth polling fast; everything else needs commands and status changes to surface quickly.
export function chooseRefreshIntervalSeconds(job: { jobStatusId: JobStatus; transcript: { createdAt: Date }[] } | null, now: Date): number {
	if (job === null || isTerminalJobStatus(job.jobStatusId)) {
		return REFRESH_INTERVAL_SECONDS;
	}
	if (job.transcript.length === 0) {
		return FAST_REFRESH_INTERVAL_SECONDS;
	}
	const latestEntryMs = Math.max(...job.transcript.map((entry) => entry.createdAt.getTime()));
	if (now.getTime() - latestEntryMs > STALE_JOB_MS) {
		return REFRESH_INTERVAL_SECONDS;
	}
	return FAST_REFRESH_INTERVAL_SECONDS;
}
