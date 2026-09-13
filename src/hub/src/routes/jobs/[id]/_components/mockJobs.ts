import type { Job } from "./jobTypes";

// hardcoded — no API/database backs this route yet.
export const mockJobs: Record<string, Job> = {
	job_8f41c9: {
		id: "job_8f41c9",
		mode: "execute",
		eyebrow: "EXECUTE",
		title: "Statement Extract — March",
		strip: {
			customer: "Northwind Financial",
			application: "Legacy Teller Portal",
			recipeVersion: "v4.2",
			recipeState: "released",
			runner: "rnr-nw-02",
			runnerAddress: "10.2.4.18",
			status: { variant: "intervention", label: "Intervention-Requested" }
		},
		stage: {
			label: "Step 14 of 19",
			note: "halted",
			timing: "started 12 Mar 2026 09:41:22 UTC · elapsed 00:06:18",
			segments: [
				{ variant: "done", weight: 13 },
				{ variant: "attention", weight: 1 },
				{ variant: "remaining", weight: 5 }
			]
		},
		transcriptMeta: "128 entries · UTC",
		transcript: [
			{
				dateLabel: "Thu 12 Mar 2026",
				entries: [
					{
						time: "09:41:18",
						kind: "status",
						text: "job created, queued for runner pool",
						statusChange: { variant: "pending", label: "→ PENDING" }
					},
					{
						time: "09:41:22",
						kind: "status",
						text: "picked up by runner rnr-nw-02",
						statusChange: { variant: "running", label: "→ RUNNING" }
					},
					{ time: "09:41:24", kind: "step", text: "open /reports/statements" },
					{ time: "09:41:31", kind: "step", text: "click \"Account Search\" button" },
					{ time: "09:41:33", kind: "step", text: "type acct_no →", redacted: "•••• 4417", pii: true },
					{
						time: "09:41:36",
						kind: "recover",
						text: "dismissed \"What's new\" popup · scenario news_modal"
					},
					{ time: "09:41:39", kind: "info", text: "waiting for results table (2.4s)" },
					{ time: "09:41:41", kind: "step", text: "extract closing_balance → 48,120.55" },
					{
						time: "09:47:14",
						kind: "halt",
						text: "step 14 click \"Continue\" failed, no recoverable scenario matched",
						statusChange: { variant: "intervention", label: "→ INTERVENTION-REQUESTED" }
					},
					{ time: "09:47:14", kind: "info", text: "awaiting operator" }
				]
			}
		],
		resultsMeta: "3 / 5 collected",
		results: [
			{ label: "statement_period", value: "2026-03" },
			{ label: "account_no", value: "•••• 4417", redacted: true, sensitive: true },
			{ label: "closing_balance", value: "48,120.55" },
			{ label: "txn_count", value: "", pending: true },
			{ label: "fees_total", value: "", pending: true }
		],
		interventionMessage: "Runner halted at step 14 — waiting 03:40 for an operator."
	},
	job_7c0b31: {
		id: "job_7c0b31",
		mode: "training",
		eyebrow: "TRAINING",
		title: "Learn: Statement Extract",
		strip: {
			customer: "Northwind Financial",
			application: "Legacy Teller Portal",
			recipeVersion: "v5.0",
			recipeState: "draft",
			runner: "rnr-nw-02",
			runnerAddress: "10.2.4.18",
			status: { variant: "success", label: "Completed-Success" }
		},
		stage: {
			label: "9 of 9 steps",
			note: "finished, draft recipe compiled",
			timing: "started 11 Mar 2026 09:12:02 UTC · duration 00:00:33",
			segments: [{ variant: "done", weight: 1 }]
		},
		transcriptMeta: "41 entries · 6 screenshots · UTC",
		transcript: [
			{
				dateLabel: "Wed 11 Mar 2026",
				entries: [
					{
						time: "09:12:02",
						kind: "status",
						text: "training job created, goals accepted",
						statusChange: { variant: "pending", label: "→ PENDING" }
					},
					{
						time: "09:12:09",
						kind: "status",
						text: "picked up by runner rnr-nw-02 · allowlist seeded",
						statusChange: { variant: "running", label: "→ RUNNING" }
					},
					{ time: "09:12:11", kind: "step", text: "open login page", screenshot: true },
					{ time: "09:12:14", kind: "plan", text: "locate the statements search form · llm, 2 candidates" },
					{
						time: "09:12:16",
						kind: "step",
						text: "click \"Reports\" nav item · selector refined from x,y",
						screenshot: true
					},
					{
						time: "09:12:19",
						kind: "step",
						text: "type user_id →",
						redacted: "•••• 2210",
						pii: true,
						screenshot: true
					},
					{
						time: "09:12:24",
						kind: "observe",
						text: "proposed output field closing_balance from \"Ending balance\""
					},
					{ time: "09:12:31", kind: "step", text: "extract closing_balance → 48,120.55", screenshot: true },
					{ time: "09:12:33", kind: "plan", text: "Finished — all requested fields captured" },
					{
						time: "09:12:35",
						kind: "terminal",
						text: "run finished, compiling draft recipe",
						statusChange: { variant: "success", label: "→ COMPLETED-SUCCESS" }
					}
				]
			}
		],
		resultsMeta: "learned fields",
		results: [
			{ label: "statement_period", value: "2026-03" },
			{ label: "account_no", value: "•••• 4417", redacted: true, sensitive: true },
			{ label: "closing_balance", value: "48,120.55" },
			{ label: "txn_count", value: "142" }
		],
		goals: {
			description:
				"Extract the monthly statement period, account number, closing balance and transaction count for a given account from the Teller Portal.",
			allowlist: "teller.northwind.test"
		}
	}
};
