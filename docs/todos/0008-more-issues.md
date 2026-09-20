

1. The Recipe Compilation was intended to do 4 things, but right now it only does one (outputs):
   1. Identify the target outputs from the goal to create the final set of outputs
   2. Get ideal steps list: Provide the inputs, outputs, and data from training plan + transcript to get a better set of steps to use, with the option of conditionals and with a final checkpoint and with any unnecessary outputs from the training run either skipped or converted into vars (if we implemented those, can't recall if we left those on the defer list or pulled them in)
   3. Identify any recoverable scenarios that were present to add to recoveries: what is the condition + series of steps for each
   4. Generate a summarized name for the recipe
2. Recipe name needs a max length of ~40
3. Enter by label name does not work correctly, here is an example transcript line that fails on bamboo login despite label being id linked to input:
        ```
        STEP Enter supplied username ▣ ▾
        id: fill username
        outcome: failed
        recipe step: fill label "Username" from cred: username
        observed: fill on element
        ```
