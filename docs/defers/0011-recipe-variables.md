# DEFER 11: Recipe variables

## What?
Converting observed Results into Recipe variables (`var` refs) during compilation is deferred. Compilation only keeps or drops observed Results as outputs.

## Why?
Recipe variables are not in the DSL or ARCHITECTURE.md, so there is nothing to convert into. Spec [0014-recipe-compilation-completion](../specs/0014-recipe-compilation-completion/spec.md) scopes compilation to outputs only. Revisit if the DSL gains variables.
