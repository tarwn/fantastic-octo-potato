import { describe, expect, it } from "vitest";

import { useIntegrationTestDb } from "./_test/integrationTestDb";
import { countApplications, insertApplication } from "./applicationRepository";

describe("applicationRepository", () => {
	const getDb = useIntegrationTestDb();

	it("counts zero applications in an empty table", () => {
		expect(countApplications(getDb())).toBe(0);
	});

	it("inserts an application and returns it with its assigned id", () => {
		const application = insertApplication(getDb(), "Widgets");

		expect(application).toEqual({ id: 1, name: "Widgets" });
		expect(countApplications(getDb())).toBe(1);
	});
});
