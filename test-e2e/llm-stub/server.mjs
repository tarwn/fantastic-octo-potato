import { createServer } from "node:http";

import { DEFAULT_LLM_STUB_PORT } from "./port.mjs";

// A minimal stand-in for an OpenAI-scheme chat completions endpoint (see docs/context/tools/target-app.md
// for the "local stand-in service" pattern this mirrors). Canned responses are queued per test via
// POST /_script and popped in order as Hub's LLM client calls POST /v1/chat/completions, so each
// spec controls exactly what the "model" says next without hitting a real OpenAI endpoint.

const port = Number(process.env.LLM_STUB_PORT ?? DEFAULT_LLM_STUB_PORT);

/** @type {{ content: string }[]} */
let queue = [];
let requestCount = 0;

/** @param {import("node:http").IncomingMessage} req */
function readBody(req) {
	return new Promise((resolve) => {
		/** @type {Buffer[]} */
		const chunks = [];
		req.on("data", (/** @type {Buffer} */ chunk) => chunks.push(chunk));
		req.on("end", () => {
			const text = Buffer.concat(chunks).toString("utf-8");
			if (!text) {
				resolve(undefined);
				return;
			}
			try {
				resolve(JSON.parse(text));
			}
			catch {
				resolve(undefined);
			}
		});
	});
}

const server = createServer(async (req, res) => {
	const body = await readBody(req);

	if (req.method === "GET" && req.url === "/health") {
		res.writeHead(200).end("ok");
		return;
	}

	if (req.method === "POST" && req.url === "/_script") {
		queue = Array.isArray(body) ? body : [];
		res.writeHead(204).end();
		return;
	}

	if (req.method === "POST" && req.url === "/_reset") {
		queue = [];
		requestCount = 0;
		res.writeHead(204).end();
		return;
	}

	if (req.method === "GET" && req.url === "/_requestCount") {
		res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ count: requestCount }));
		return;
	}

	if (req.method === "POST" && req.url === "/v1/chat/completions") {
		requestCount += 1;
		const next = queue.shift();
		if (!next) {
			res
				.writeHead(500, { "content-type": "application/json" })
				.end(JSON.stringify({ error: { message: "llm stub: no scripted response queued" } }));
			return;
		}
		res
			.writeHead(200, { "content-type": "application/json" })
			.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: next.content } }] }));
		return;
	}

	res.writeHead(404).end();
});

// run.mjs (spawned with stdio: "ignore") polls /health for readiness instead of reading stdout.
server.listen(port);
