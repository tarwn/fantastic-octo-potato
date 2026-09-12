---
name: write-spec
description: Drafts a new implementation spec in docs/specs/ using this repo's outside-in, red/green/refactor process. Use when the user asks to write, draft, or plan a spec for an upcoming task.
disable-model-invocation: true
user-invocable: true
---

The goal is to produce a feature spec at `docs/specs/NNNN-short-name/spec.md`, following the [spec template](../write-spec/templates/spec.template.md).

## Guidelines

- Use only the provided input for source of truth.
- Do not infer requirements or constraints from past specs or input (idea) files
- Do not use past specs as the template or expectations, this process is regularly improving and changing
- Keep step decomposition minimal: if the change follows an existing codebase pattern, prefer one step over several.
- Favor simple solutions:
   - "debugging is twice as hard as writing a program in the first place" - Brian Kernighan
   - Code organization alone (partitioning, layering) doesn't guarantee simplicity; true simplicity comes from the components themselves being simple, not just arranged, Rich Hickey
   - "it's more important for a module to have a simple interface than a simple implementation" - John Ousterhout
- Favor clear signals and clarity of purpose:
   - "Make your workplace into a showcase that can be understood by everyone at a glance. In terms of quality, it means to make the defects immediately apparent... When this is done, problems can be discovered immediately, and everyone can initiate improvement plans." - Taiichi Ohno
   - "true efficiency is doing only the work needed to achieve the desired output, and making only what the customer needs — anything else is waste (muda)" - Taiichi Ohno
   - Channel jidoka and poka-yoke
- "Good design is as little design as possible — Less, but better. Simple as possible but not simpler. Good design elevates the essential functions of a product." - Dieter Rams

## Process

1. **Start the document**
   - Create the document from the template, treat this as your memory as you progress through the design, to be refined once all of the pieces are thought out
2. **Source the scope, don't invent it.** 
   - Do: Use the input from the user to capture a "Source" traceability reference at the bottom of the spec.
   - Intent: This content plus any necessary questions to the user will be used to develop the spec. The spec will be self-contained once complete, this line is present to capture traceability, the implementor is not intended or expected to read it as part of implementation.
3. **Goal, Requirements, Key Constraints**
   - Do: Analyze the linked source to develop the list of requirements and constraints
   - Do: Summarize the intent into a goal-oriented statement: what will be true for whom when we complete this feature
   - Intent: Constraints are limitations, they describe what the constraint is but not how to solve for it
4. **Apply System Guidelines & Principles**
   - Do: Review general design guidelines and pointers from CLAUDE.md, the "Guidelines" section above, and specifically relevant context docs from the "Reference Section" of CLAUDE.md
   - Do: Identify adjustments or expansions to requirements and constraints from that context that are directional changes. Do NOT reiterate requirements from those additional documents that would be specific to tasks assigned to an implementor or the implemtor would easily follow on their own (obvious).
5. **Defer open questions to the latest responsible moment.** 
   - Intent: Don't front-load every ambiguity. Raise a question only once the answer is needed to progress, where it would actually lock in a decision, and only if proceeding without an answer would force speculative planning for multiple potential paths to continue. 
   - Do: Collect all of them in a final "Open questions for the user" section
   - Do: once the user answers, record the answer inline right under the question (`User Answer: ...`) rather than editing the question away — the spec is the record of the decision, not just the plan, then apply that new input to the spec.
6. **Research**
   - Do: Use this moment to hypothesize what you need to know about the current codebase or from external sources, create a temporary file if needed to track the findings of this research as input into the planning step
   - Do: Capture decisions made involving 3rd party libraries or major architecture change as a draft ADR next to the spec file
7. **List explicit out-of-scope items.** Anything a reader experienced with this product, codebase, and conventions might reasonably assume is included but isn't — especially adjacent todo items or "obvious" follow-on work — gets its own bullet under "Explicitly out of scope for this spec".
8. **Plan the Steps**
   1. Intent: Implementation steps should progress from the outermost capability inward to more detailed:
      - most user-observable guard: e2e test first (what the user would
   actually see)
      - then component/unit tests
      - then the implementation that makes them pass
      - then docs/process follow-ups last
   2. Exceptional steps:
      - Insert a first step if:
         - If there are changes to the user-behavior, make new guards (ex: e2e tests) the first, standalone Step of the set and indicate in "sequencing" what Step in the plan these tests are expected to remain red through
      - Append a final step if:
         - If there are draft ADRs to move to the ADRs folder, changes to content to apply to `docs/context/*`, or other doc updates
         - If visual changes have occurred that require the visual baseline to be updated
   3. Plan the rest of the implementation Steps
      - Aspire towards fewer steps that lock in provable progress to the goal
      - Expand to more then one step for changes that would otherwise be large (>20 files) or difficult to code review (multiple complicated themes to the changes, per guidelines above on simplicity), otherwise
      - Always ask, "what new guard(s) do I add first to ensure this Step has been completed successfully" and list those in the **Guard** bullet of the step
      - Be terse, assume the implementor will be familiar with the codebase, the conventions, and overall project and focus on the specifics that shape that work
      - Record reference links (`docs/context/*` files) if they are important to performing the work correctly, to save the implementor time searching on their own
9. **Challenge the Plan**
   - Do: Start a `spec-reviewer` sub-agent with the prompt: `.claude/skills/write-spec/review-prompt.md`, pass the path to the spec file and the todo/backlog item details the spec is written for.
      - Start the review
      - Wait for the response
      - Evaluate suggestions and
         - ask the user if it requires a decision to be made
         - update the spec
10. **Create the plan file**
   - Do: Use the [plan template](./templates/plan.template.md) to produce a plan file next to the spec, populating the tasks from the spec as a checkmark list in the plan

## Keep it terse

No summary paragraphs, no restating the goal inside each step. If a
sentence doesn't change what someone should do or decide, cut it. If the "Out of Scope" 
or "Open Questions" sections do not have items, cut them.
