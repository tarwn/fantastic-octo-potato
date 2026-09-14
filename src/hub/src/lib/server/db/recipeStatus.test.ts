import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RecipeStatus } from "./recipeStatus";

const migrationsDir = join(import.meta.dirname, "..", "..", "..", "..", "db", "migrations");

function readSeededRecipeStatusRows(): { id: number; name: string }[] {
	const migrationFile = readdirSync(migrationsDir).find((name) => name.endsWith("_create_initial_schema.sql"));
	const sql = readFileSync(join(migrationsDir, migrationFile as string), "utf-8");
	const insertStatement = sql.match(/INSERT INTO recipe_status \(id, name\) VALUES ([\s\S]+?);/);
	return [...(insertStatement as RegExpMatchArray)[1].matchAll(/\((\d+),\s*'([^']+)'\)/g)].map(([, id, name]) => ({
		id: Number(id),
		name
	}));
}

describe("RecipeStatus", () => {
	it("matches the ids and names seeded for recipe_status in the initial schema migration", () => {
		expect(readSeededRecipeStatusRows()).toEqual([
			{ id: RecipeStatus.Draft, name: "Draft" },
			{ id: RecipeStatus.Released, name: "Released" }
		]);
	});
});
