// Mirrors src/hub/src/lib/types/recipeDefinition.ts field-for-field. Hub and runner-web are
// separate TypeScript projects with no shared package (see runnerClient.ts's JobStep/ClaimedJob,
// which mirror runnerActions.ts the same way) — this is runner-web's own copy of the DSL shapes
// described in docs/todos/supporting-docs/steps-dsl.md.

export type FieldType = "string" | "number" | "boolean";

export interface FieldDeclaration {
	type: FieldType;
	description: string;
	required: boolean;
	nullable: boolean;
	sensitive: boolean;
	enum?: string[];
}

export type TargetElement = { by: "text"; value: StringValue; exact?: boolean } | { by: "label" | "placeholder" | "css"; value: StringValue };
export type ReadSpec = {
	source: "text" | "value";
	extract: { by: "regex"; pattern: string; group: number | string };
	parse?: "string" | "number";
};
export type TargetPoint = { by: "point"; x: number; y: number };
export type Target = TargetElement | TargetPoint;

export type ValueRef = { ref: "input" | "output" | "credential"; name: string };
export type Destination = { ref: "output"; name: string };
export type ScalarValue = string | number | boolean | null;
export type Value = ScalarValue | ValueRef;
export type StringValue = string | ValueRef;

export type AtomicCondition =
	| { test: "exists" | "visible" | "enabled" | "disabled"; args: [Target] }
	| { test: "assigned"; args: [Destination] };
export type CompositeCondition = { test: "all" | "any"; args: AtomicCondition[] };
export type Condition = AtomicCondition | CompositeCondition;

export type SelectOption = { by: "value" | "label"; value: StringValue };
export type IfCase = { when: Condition; steps: ChildStep[] };

interface StepBase {
	id: string;
	intent?: string;
	irreversible?: boolean;
}

// One-level nesting only: a ChildStep can never itself be a group/if.
export type ChildStep =
	| (StepBase & { action: "open"; args: [StringValue] })
	| (StepBase & { action: "click"; args: [Target] })
	| (StepBase & { action: "focus"; args: [TargetElement] })
	| (StepBase & { action: "fill"; args: [TargetElement, StringValue] })
	| (StepBase & { action: "select"; args: [TargetElement, SelectOption[]] })
	| (StepBase & { action: "scrollIntoView"; args: [TargetElement] })
	| (StepBase & { action: "scroll"; args: [number, number] })
	| (StepBase & { action: "read"; args: [Target, "text" | "value" | "number" | ReadSpec, Destination] })
	| (StepBase & { action: "check"; args: [Condition] })
	| (StepBase & { action: "verify"; args: [Condition] })
	| (StepBase & { action: "assign"; args: [Destination, Value] })
	| (StepBase & { action: "goto"; args: [string] })
	| (StepBase & { action: "finish"; args: [Condition | null] })
	| (StepBase & { action: "fail"; args: [string, string] });

export type Step = ChildStep | (StepBase & { action: "group"; args: [ChildStep[]] }) | (StepBase & { action: "if"; args: [IfCase[], ChildStep[]] });

export interface Recovery {
	id: string;
	description: string;
	when: Condition;
	steps: ChildStep[];
}

export interface RecipeDefinition {
	schemaVersion: number;
	inputs: Record<string, FieldDeclaration>;
	outputs: Record<string, FieldDeclaration>;
	steps: Step[];
	recoveries: Recovery[];
}
