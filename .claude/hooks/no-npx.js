// PreToolUse hook: blocks stray `npx` usage in Bash tool calls.
// `npx playwright ...` is allowed (Playwright is invoked directly, not via
// an `npm run` guard); every other `npx ...` invocation should instead go
// through the documented `npm run <script>` entry points in CLAUDE.md.

let input = "";
process.stdin.on("data", (chunk) => {
	input += chunk;
});

process.stdin.on("end", () => {
	let payload;
	try {
		payload = JSON.parse(input);
	} catch {
		process.exit(0);
	}

	if (payload.tool_name !== "Bash") {
		process.exit(0);
	}

	const command = payload.tool_input?.command ?? "";
	// Only match `npx` at the start of a command segment (split on shell
	// chaining operators) so mentions of the word "npx" inside quoted
	// strings/commit messages/file paths elsewhere in the command aren't
	// mistaken for an actual invocation.
	const segments = command.split(/&&|\|\||[|;]|\r?\n/);
	for (const segment of segments) {
		const match = segment.trim().match(/^npx\s+(\S+)/);
		if (match && match[1] !== "playwright") {
			console.error(
				'Blocked: "npx" is only allowed as "npx playwright ...". ' +
					'Use "npm run <script>" instead — see CLAUDE.md\'s "Commands" section.'
			);
			process.exit(2);
		}
	}

	process.exit(0);
});
