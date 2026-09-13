import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

const importSortGroups = [
	// Packages: key named libraries first, then any other package
	["^svelte", "^@sveltejs", "^@?\\w"],
	// Side effect imports
	["^\\u0000"],
	// Parent imports. Put `..` last.
	["^\\.\\.(?!/?$)", "^\\.\\./?$"],
	// Other relative imports. Put same-folder imports and `.` last.
	["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
	// Style and svg imports.
	["^.+\\.?(css|scss)$", "^.+\\.?(svg)$"]
];

export default tseslint.config(
	{
		// .claude/worktrees/ can contain other in-progress worktrees (each with
		// their own tsconfig.json), which confuses typescript-eslint's
		// automatic tsconfigRootDir detection into seeing multiple candidate
		// project roots — exclude the whole .claude/ tree, none of which is
		// app source anyway.
		ignores: ["**/build/", "**/.svelte-kit/", "**/dist/", "**/node_modules/", ".claude/"]
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...svelte.configs.recommended,
	{
		plugins: {
			"@stylistic": stylistic,
			"simple-import-sort": simpleImportSort
		},
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			// Pins the project root typescript-eslint resolves tsconfig.json
			// against — without it, a nested worktree under .claude/worktrees/
			// (each with its own tsconfig.json) makes auto-detection see
			// multiple candidate roots and fail outright.
			parserOptions: {
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			"@stylistic/quotes": ["error", "double"],
			"@stylistic/comma-dangle": ["error", "never"],
			"@stylistic/semi": ["error", "always"],
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_.*$",
					caughtErrorsIgnorePattern: "^_.*$",
					destructuredArrayIgnorePattern: "^_.*$",
					varsIgnorePattern: "^_.*$"
				}
			],
			"no-console": "warn",

			// reduce sprawl
			"@stylistic/brace-style": ["error", "stroustrup"],
			"@stylistic/array-bracket-spacing": ["error", "never"],
			"@stylistic/array-element-newline": ["error", { consistent: true, multiline: true }],
			"@stylistic/object-curly-spacing": ["error", "always"],
			"@stylistic/no-multi-spaces": "error",

			// auto organize imports
			"simple-import-sort/imports": ["warn", { groups: importSortGroups }],

			// "_test/" folders hold test-only helpers (see ADR 12) — never
			// let production code depend on test-only code.
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["**/_test/**"],
							message: "\"_test/\" folders hold test-only helpers; only *.test.ts/*.spec.ts files may import from them."
						}
					]
				}
			]
		}
	},
	{
		// Test files (and the "_test/" helpers themselves) are the only code
		// allowed to import test-only helpers.
		files: ["**/*.test.ts", "**/*.spec.ts", "**/_test/**"],
		rules: {
			"no-restricted-imports": "off"
		}
	},
	{
		files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
		languageOptions: {
			parserOptions: {
				parser: tseslint.parser
			}
		},
		rules: {
			// Generic indent/@stylistic/indent don't understand Svelte's
			// script/markup/style mix and can corrupt .svelte files — use the
			// svelte-plugin's own indent rule instead.
			"svelte/indent": ["error", { indent: "tab" }]
		}
	},
	{
		// CommonJS CLI script invoked directly by git hooks (node tools/**/*.cjs), not bundled
		files: ["tools/guards/**/*.cjs", "tools/hooks/**/*.cjs"],
		rules: {
			"@typescript-eslint/no-require-imports": "off",
			"no-console": "off"
		}
	},
	{
		// runner-web's sanctioned console sink — its whole job is console output
		files: ["src/runner-web/logger.ts"],
		rules: {
			"no-console": "off"
		}
	}
);
