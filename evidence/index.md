# Evidence Files

## 1-training-run

- [Artifact: job-ca1-16](./1-training-run/job-ca1-16.json): full job export, includes goal, ingredients, LLM generated steps, transcript
- [Brief Animation](./1-training-run/TrainingRunAnimation.gif): watching it figure out the login at the beginning, redaction on credentials
- [Completed Job view](./1-training-run/Completed-training-run.png): job screen when it finished successfully + generated recipe (link near top)
- [Recipe screenshot](./1-training-run/CompletedRecipe.png): which will be used in the next run...

**Goal**:
```text
Find if \"Contoso Consulting\" has an active invoice and capture the invoice id, invoice amount, and invoice total. Log into Bamboo, find the list of invoices. If \"Contoso Consulting\" does not have an active invoice then set invoice_id, invoice_amount, and invoice_total to null. If there is an invoice, capture the invoice id to invoice_id and then open the invoice and find the amount to store as invoice_amount and the total to store as invoice_total. The job is complete successfully when all 3 invoice fields (invoice_id, invoice_amount, invoice_total) are set.
```

*(Goal text, job id, recipe id's, etc will match in the export files)*

## 2-trial-run-new-customer
Input: "John Smith"

- [Artifact: job-ca1-17](./2-trial-run-new-customer/job-ca1-17.json): full job export file, includes Recipe, ingredients, transcript, masked outputs
- [Start trial dialog](./2-trial-run-new-customer/01-start-trial-from-recipe.png): Same recipe above, the human reviewer view before they run it 
- [Completed successfully](./2-trial-run-new-customer/02-completed-transcript.png): Finished view when the run completed
- [Screenshot, redaction](./2-trial-run-new-customer/screenshot-aggressive-redaction.png): Outputs were redacted, a credit card number and phone number were redacted
- [Screenshot by me](./2-trial-run-new-customer/screenshot-manual.png): Manually logged in to show the fields behind the redaction
- [Available to publish](./2-trial-run-new-customer/99-available-for-publish.png): successful trial makes it available to publish

Details:
1. This is a different company ("John Smith") then the training one above
2. The LLM aggressive marked all 3 outputs as sensitive in the recipe, so the runner redacted them in screenshots and safe values for UI
3. The runner detected a phone number and credit card in the notes and redacted those too
   1. Fun note: the redaction blocks are big because it's mostly text with <br />'s, so some 
4. The animated view in the first stage also shows the username/password being redacted, the runner redacts all locally configured credentials

## 3-published-recipe
Input: "Contoso Consulting"

- [Artifact: job-ca1-18](./3-published-recipe/job-ca1-18.json): full job export file like above, main difference is "Execute" mode instead of "Trial"
- [End screenshot](./3-published-recipe/01-completed-again.png)
- [Fun text extraction logic](./3-published-recipe/text-extraction-step-details.png): the amount, total, and tax are in a single <p> with <br/>'s, this recipe learned to find a block with text match and use a regex to extract the amount and total, this is also why the redaction blocks are so large (runner is overlaying the whole HTML element)

## 4-nonexistent-company
Input: "asaasda"

- [Artifact: job-ca1-19](./4-nonexistent-company/job-ca1-19.json): full job export like above, for consistency
- [End screenshot](./4-nonexistent-company/screenshot-completed.png): it set all 3 to nulls from the else statement after not finding the company

An opportunity for two improvements here: (1) transcript entry for the conditional outcome, (2) not redacting explicit `null` outputs

## x-intervention
A broken recipe stalls and requires human intervention, this shows the operator takeover, action, and ceding control back.

- [Artifact: job-ca1-20](./x-trial-run-intervention/job-ca1-20.json): full export, intervention transcript entries are ln 484-520
- [start the broken recipe](./x-trial-run-intervention/01-start-trial-dialog.png)
- [animated start until it stalls](./x-trial-run-intervention/InterventionAnimation.gif)
- [intervention overlay](./x-trial-run-intervention/02-intervention-overlay.png) - click sends "Click at x,y", runner tries to observe a better selector on these
- [intervention complete, w/ operator logged](./x-trial-run-intervention/03-intervention-complete.png)

