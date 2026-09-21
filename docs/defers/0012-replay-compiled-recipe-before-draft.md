# DEFER 12: Automatically replaying the compiled Recipe during compilation

## What?
Compilation does not replay or trial the compiled Recipe itself. Its ideal Steps and recoveries are validated structurally only, then saved as a Draft.

## Why?
The Draft exists so that a human can review the compiled Recipe first, and only then replay it as a Trial Job, which is what qualifies it for publishing. Spec [0014-recipe-compilation-completion](../specs/0014-recipe-compilation-completion/spec.md) leaves automatic pre-Draft replay out of scope. Revisit if compiled Recipes regularly fail their first Trial and an automatic check would save the reviewer time.
