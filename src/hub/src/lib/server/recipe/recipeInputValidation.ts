import type { FieldDeclaration } from "$lib/types/recipeDefinition";

// Validates ingredient values against the Recipe's declared inputs (R006): required/nullable/type/enum,
// plus rejecting any ingredient the Recipe doesn't declare. Mirrors recipeDefinitionValidation.ts's
// "reject before dispatch" spirit, but for a Job's runtime inputs rather than the Recipe's own shape.
export function validateIngredients(inputs: Record<string, FieldDeclaration>, ingredients: Record<string, unknown>): string[] {
	const errors: string[] = [];

	for (const [name, declaration] of Object.entries(inputs)) {
		const value = ingredients[name];
		if (value === undefined) {
			if (declaration.required) {
				errors.push(`${name} is required`);
			}
			continue;
		}
		if (value === null) {
			if (!declaration.nullable) {
				errors.push(`${name} cannot be null`);
			}
			continue;
		}
		if (typeof value !== declaration.type) {
			errors.push(`${name} must be a ${declaration.type}`);
			continue;
		}
		if (declaration.enum && !declaration.enum.includes(String(value))) {
			errors.push(`${name} must be one of: ${declaration.enum.join(", ")}`);
		}
	}

	for (const name of Object.keys(ingredients)) {
		if (!(name in inputs)) {
			errors.push(`Unknown ingredient: ${name}`);
		}
	}

	return errors;
}
