# Component-specific SCSS Files

Reference: [Button.scss](../../src/shared/components/button/Button.scss)

Notable:
* Always import variables, `@use "../../../styles/variables" as *;`
    * Always use variables for colors, sizes, distances
* Consider importing [mixins](../../src/styles/mixins/)
* Always include one main CSS class name that wraps all styles and sub-classes fo the component, ex: `.frap-button`
* Always start class names with the `frap-` prefix to prevent CSS pollution from extensions
