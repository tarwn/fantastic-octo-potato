# DEFER 10: Human Intervention for Training Jobs

## What?
Take Control, commands, and hand-back for Training Jobs are deferred. Live Human Intervention applies to Recipe Jobs only.

## Why?
Spec [0013-human-intervention](../specs/0013-human-intervention/spec.md) scopes intervention to Recipe Jobs. Training keeps its Hub-authoritative progression model (Hub derives and persists each Step), so an operator taking over would need a different ownership and resume model than Recipe's Runner-authoritative position resume. Revisit if Training runs need a human to unstick them.
