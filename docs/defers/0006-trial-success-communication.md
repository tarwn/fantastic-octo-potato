# DEFER 6: User communication on Trial success

## What?
ARCHITECTURE Trial step 4 says a communication is sent to the user when a Trial succeeds, indicating the Recipe is ready to publish. Spec [0011-publish-recipe](../specs/0011-publish-recipe/spec.md) does not send one; the Hub instead shows the Trial state (not yet qualified / Trial passed with a link to the Trial Job) on the Registered Application Recipes panel and Recipe review screen.

## Why?
Notifications need a delivery channel and user preferences that don't exist yet. Hub-visible state gives the operator what they need to publish without log or database inspection. Revisit when a notification mechanism is introduced.
