import { error } from "@sveltejs/kit";

import { mockJobs } from "./_components/mockJobs";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
	const job = mockJobs[params.id];

	if (!job) {
		error(404, "Job not found");
	}

	return { job };
};
