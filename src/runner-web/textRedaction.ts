// Same masking token/intent as screenshotMasking.ts's overlay (known secrets never reach a
// screenshot, a Hub-bound message, or a local log line) — this is the plain-text counterpart, usable
// anywhere outside a page.evaluate browser context.
export const MASK_TOKEN = "••••••";

// Redacts every occurrence of a known secret (credential value, declared-sensitive input/output)
// in free-form text before it's sent to Hub or written to a local log line.
export function redactKnownSecrets(text: string, secrets: string[]): string {
	let result = text;
	for (const secret of secrets) {
		if (secret === "") {
			continue;
		}
		result = result.split(secret).join(MASK_TOKEN);
	}
	return result;
}
