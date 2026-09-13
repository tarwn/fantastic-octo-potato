# Shared components

Pattern for components under `src/hub/src/lib/components/` — promoted out of a
page's local `_components` folder once reused elsewhere, per
[conventions.md](../conventions.md)'s local-first rule. `Button`,
`LinkAsButton`, `Tag`, and `DateSpan` are the canonical examples.

## Prop pattern

* Every shared component's props type extends `SharedComponentProps` (`src/hub/src/lib/components/sharedComponentProps.ts`) to enforce a common set of props all components are expected to implement

```svelte
let { text, size, variant, class: className }: SharedComponentProps & { ... } = $props();
```

## Enum-driven size/variant props

Visual variation (size, semantic color/style) is a string-literal union
type, not a boolean per variant or a raw string:

```ts
export type ButtonSize = "xs" | "small" | "regular" | "large";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-secondary";
```

Each type lives in its own `<name>Types.ts` file next to the component
(`buttonTypes.ts`, `tagTypes.ts`) so it can be imported without pulling
in the `.svelte` file. The type covers the *full* mixin surface
available in `styles/mixins/`, not just the values already used
somewhere in the app today, to prevent accidental drift:

```svelte
class={["tag", `tag--${variant}`, className].filter(Boolean).join(" ")}
```

```scss
.tag--success {
  @include tag-variant-success;
}
```

## Semantic HTML per component

`Button` renders `<button type="button">`, `LinkAsButton` renders
`<a>`, `Tag` renders `<span>`, `DateSpan` renders `<span>` — each picks
the element for its native behavior, per conventions.md's
semantic-HTML rule, regardless of the two button-like components
sharing the same visual mixins.

