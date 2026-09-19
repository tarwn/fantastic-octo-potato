# DEFER 5: Masking a sensitive value embedded in goal text

## What?
An operator's Training Run goal text can itself embed a sensitive example value (e.g. "look up account ACCT-1042"). Spec [0009-training-run](../specs/0009-training-run/spec.md) leaves the goal string unmasked everywhere it's stored, shown, or transmitted — only Ingredients, transcript entries, and screenshots get masked (R011). Masking a sensitive substring within the goal text itself is deferred.

## Why?
The idea doc behind this spec flagged the question unresolved: once R002 identifies which substring of the goal is sensitive, should the stored/displayed/transmitted goal be masked, and if so, at what point (e.g. completion of the job)? That requires deciding how to mask a value embedded inside free text the operator wrote and continues to see verbatim on the Job screen — a different problem than masking a discrete named Ingredient/Result value. The user's answer (spec 0009, Open Question 1) was to leave this out of 0009 and file it as its own Defer. Revisit once there's a concrete need (e.g. an operator or compliance requirement to not display/store the raw goal text once a sensitive value within it is known).
