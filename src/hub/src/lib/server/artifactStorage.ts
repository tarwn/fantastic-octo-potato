import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Relative to process cwd, mirroring HUB_DATABASE_URL's `.data/...` convention (src/hub/.env.example).
// Gitignored by the existing `/.data/*` rule (src/hub/.gitignore) — no new ignore entry needed.
const ARTIFACT_STORAGE_DIR = ".data/artifacts";

// The Runner has already masked the image before upload — this stores exactly the bytes
// it sent, there is no separate raw/safe pair to keep here (unlike job_result's masked-upsert path).
export function writeJobStepArtifact(customerId: number, jobId: number, stepId: string, image: Buffer): string {
	const safeStepId = stepId.replace(/[^a-zA-Z0-9_-]/g, "_");
	const relativePath = join(ARTIFACT_STORAGE_DIR, `customer-${customerId}-job-${jobId}-step-${safeStepId}.png`);
	mkdirSync(dirname(relativePath), { recursive: true });
	writeFileSync(relativePath, image);
	return relativePath;
}

export function readJobStepArtifact(filePath: string): Buffer {
	return readFileSync(filePath);
}
