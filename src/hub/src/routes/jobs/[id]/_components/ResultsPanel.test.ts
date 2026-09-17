import { render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import ResultsPanel from "./ResultsPanel.svelte";

import { SensitivityType } from "$lib/sensitivityType";
import type { JobResult } from "$lib/types/job";

describe("ResultsPanel", () => {
	it("renders a None-sensitivity result's safe value as plain text", () => {
		const results: JobResult[] = [{ fieldName: "customerName", safeValue: "Northwind", sensitivityType: SensitivityType.None }];

		render(ResultsPanel, { results });

		expect(screen.getByText("Northwind")).toBeInTheDocument();
	});

	it("renders a PII/Other-sensitivity result's masked value as a redacted value", () => {
		const results: JobResult[] = [{ fieldName: "ssn", safeValue: "••••••", sensitivityType: SensitivityType.PII }];

		render(ResultsPanel, { results });

		expect(screen.getByText("••••••")).toHaveClass("redacted");
	});
});
