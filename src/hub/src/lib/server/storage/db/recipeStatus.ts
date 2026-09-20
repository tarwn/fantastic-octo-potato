// Values mirror the explicit, hardcoded ids seeded for recipe_status in the create_initial_schema
// and add_recipe_archive_and_replacement migrations — keep them in sync.
export enum RecipeStatus {
	Draft = 1,
	Released = 2,
	Archived = 3
}
