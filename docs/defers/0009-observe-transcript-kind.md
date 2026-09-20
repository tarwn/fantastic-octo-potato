# DEFER 9: `observe` transcript kind

## What?
An `observe` transcript kind was intended for the Runner to raise specific observations, such as a better selector than the one the plan already had. This would be especially useful when training or when compiling human observation runs into a new draft Recipe.

This includes emitting an "Observe" row when a click is sent with an x,y target, repeating the DSL step's selector suggestion. It was not built.

## Why?
It does not appear necessary for the POC goal. Each Step already tracks mini observations, which provide value on their own without a dedicated transcript kind.
