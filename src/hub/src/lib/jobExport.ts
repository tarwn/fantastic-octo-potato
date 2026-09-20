import { JobType } from "$lib/jobType";
import type { JobDetail } from "$lib/types/job";

export function buildJobExport(job: JobDetail) {
	return job.jobType === JobType.Recipe
		? { recipe: job.recipe, transcript: job }
		: { run: { steps: job.steps, ingredients: job.ingredients }, transcript: job };
}
