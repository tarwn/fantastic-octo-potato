import { JobType } from "$lib/jobType";
import type { JobDetail } from "$lib/types/job";

export function buildJobExport(job: JobDetail) {
	return job.jobType === JobType.Recipe
		? job
		: { transcript: job };
}
