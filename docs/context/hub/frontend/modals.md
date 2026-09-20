# Modals

Pattern for a modal dialog local to a page's `_components` folder — copy [StartRecipeJobModal.svelte](../../../../src/hub/src/routes/registered-applications/[id]/_components/StartRecipeJobModal.svelte) as the reference implementation; keep future modals consistent with it rather than inventing a new approach per modal.

* Native `<dialog>` element, not a UI library — opened with `.showModal()`, closed with `.close()`.
* Props are `open: boolean` and `onClose: () => void`; a `$effect` watches `open` against `dialogEl.open` to call `showModal()`/`close()`, and the dialog's own `close` event (Escape, or a Cancel button calling `dialogEl.close()`) calls `onClose()` to keep the parent's state in sync.
* Style the dialog surface with `@include panel` plus `$box-shadow-overlay`; style `&::backdrop` with `$overlay-backdrop-color`. No new tokens needed.
* Put `novalidate` on the `<form>` and do all validation/messaging yourself in the submit handler (`event.preventDefault()`) — native constraint validation (e.g. an invalid `type="url"` value) otherwise blocks the `submit` event before your handler ever runs.
* Each field's error `<span>` gets an `id`; the input/textarea carries `aria-invalid={!!fieldError}` and `aria-describedby` pointing at that `id` (only set when the error is present).
* Show a loading state while a modal fetches its data, rendered before the empty/list branches — an initial empty value otherwise flashes the empty state.
* A read-only viewer modal (no form) follows the same open/close wiring.
