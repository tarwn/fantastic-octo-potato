// Values mirror the explicit, hardcoded ids seeded for recipe_status in
// db/migrations/20260914000612_create_initial_schema.sql — keep both in sync.
export enum RecipeStatus {
	Draft = 1,
	Released = 2
}
