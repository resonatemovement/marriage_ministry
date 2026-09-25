const textFieldSelector = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="search"]',
  'input[type="password"]',
  'input[type="number"]',
  "textarea",
  '[contenteditable]:not([contenteditable="false"])',
].join(",");

export function focusFirstDialogTextField(event: Event) {
  const content = event.currentTarget as (EventTarget & { querySelectorAll?: (selector: string) => NodeListOf<HTMLElement> }) | null;
  if (!content?.querySelectorAll) return;

  const field = Array.from(content.querySelectorAll(textFieldSelector)).find((candidate) =>
    candidate.getClientRects().length > 0 && !candidate.closest("[hidden], [aria-hidden='true']"),
  );
  if (!field) return;

  event.preventDefault();
  field.focus();
}
