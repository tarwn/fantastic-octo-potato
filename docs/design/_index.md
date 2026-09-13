# Design Files

These files are generated from Claude Code. The mockups are directional and may not reflect the specific details that have been decided on in the SCSS artifacts. SCSS artifacts are considered to be more definitive at their smaller scope and should have enough information to make additions or expansions on.

Index of files:

- [Main Mockup: Hub Job Page](./Hub%20Job%20Page.dc.html): Example of Job page for Training and Execute modes for reference, has not been aligned with final decisions reflected in the SCSS files
- [Hub Components](./Hub%20Components.dc.html): Examples of components built alongside the SCSS variables and mixins files to help understand how to use the mixins for several components extracted from the mockup, consider this more concrete and aligned to the SCSS values
- scss/
  - `_variables.scss` - design and derived tokens to import directly in as SCSS variables for this app
  - `components.scss` - example using the mixins for styles that were used in the Hub Components page above
  - components/*.scss - SCSS mixin files for common components, referenced in the Hub Components page above
