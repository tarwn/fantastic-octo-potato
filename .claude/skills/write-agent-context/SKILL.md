---
name: write-agent-context
description: drafts a new agent reference file on a given topic and includes it in the references list
---

Your goal is to write a new reference file on a single concept or reference pattern in the code base, using a template to create the file, save it in the correct reference folder, and then add it to the correct references index file.

Template: [_reference-code.md](./_reference-code.md)
Example Output: [_example.md](./_example.md)

## Step 1: Gather information

You need the following information from the user before starting:

1. The topic of the reference file
2. The target location: 
  - hub: topics specific to `src/hub/*`
  - runner-web: topics specific to `src/runner-web/*`
  - cross-system-contracts: data and behavior contracts between hub and runner-web
  - tools: agent tool scripts, automation scripts, top-level e2e tests
  - general: final category if nothing else fits
3. The example file or file list to write the reference around

## Step 2: Execute

1. Examine the provided example file with the given topic in mind
  - Is it using common conventions?
  - What is notably different about this implementation than common conventions that indicate key decisions or patterns?
2. Using the template and identified location, create the reference markdown file. Use the topic name in kebab case for the filename.
  - location: docs/context/{target location}/{filename}.md
3. Add a bullet to the reference index for the location using markdown link syntax:
  - location: docs/context/{target location}/_index.md
