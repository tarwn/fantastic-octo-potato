// Display-only string id per R012 (docs/specs/0006-job-queue/spec.md); routes/APIs
// still use the plain integer job id.
export function formatJobDisplayId(customerApplicationXrefId: number, jobId: number): string {
	return `job-ca${customerApplicationXrefId}-${jobId}`;
}
