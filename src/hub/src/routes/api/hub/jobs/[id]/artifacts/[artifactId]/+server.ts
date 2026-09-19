import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

import { getJobStepArtifactImage } from "$lib/server/jobActions";
import { getDb } from "$lib/server/storage/db";

export const GET: RequestHandler = ({ params }) => {
	const result = getJobStepArtifactImage(getDb(), params.id, params.artifactId);
	if (!result) {
		return error(404, `Artifact ${params.artifactId} not found`);
	}

	return new Response(new Uint8Array(result.image), { headers: { "content-type": "image/png" } });
};
