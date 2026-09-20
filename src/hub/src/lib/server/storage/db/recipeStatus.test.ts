import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RecipeStatus } from "./recipeStatus";

const migrationsDir = join(import.meta.dirname, "..", "..", "..", "..", "..", "db", "migrations");

// Regex-parses the seed INSERTs rather than running dbmate; if a later migration reshapes or
// moves these statements, update the match here rather than assuming the drift-guard still works.
function readSeededRecipeStatusRows(): { id: number; name: string }[] {
	const rows: { id: number; name: string }[] = [];
	for (const migrationFile of readdirSync(migrationsDir).sort()) {
		const upSql = readFileSync(join(migrationsDir, migrationFile), "utf-8").split("-- migrate:down")[0];
		for (const insertStatement of upSql.matchAll(/INSERT INTO recipe_status \(id, name\) VALUES ([\s\S]+?);/g)) {
			rows.push(...[...insertStatement[1].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(([, id, name]) => ({ id: Number(id), name })));
		}
	}
	return rows;
}

describe("RecipeStatus", () => {
	it("matches the ids and names seeded for recipe_status across the migrations", () => {
		expect(readSeededRecipeStatusRows()).toEqual([
			{ id: RecipeStatus.Draft, name: "Draft" },
			{ id: RecipeStatus.Released, name: "Released" },
			{ id: RecipeStatus.Archived, name: "Archived" }
		]);
	});
});
