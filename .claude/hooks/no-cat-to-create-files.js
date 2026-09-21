// PreToolUse hook: blocks usage of `cat >>` to create files
//	over using the built-in tools

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
	const segments = command.split(/&&|\|\||[|;]|\r?\n/);
	for (const segment of segments) {
		const match = segment.trim().match(/^cat\s+>{1,2}/);
		if (match) {
			console.error(
				'Blocked: use built-in Edit or Write tools to create files, not `cat`'
			);
			process.exit(2);
		}
	}

	process.exit(0);
});
