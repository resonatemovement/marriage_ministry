import { describe, expect, it, vi } from "vitest";

import { focusFirstDialogTextField } from "./dialog-focus";

function field({ visible = true, hidden = false } = {}) {
  return {
    focus: vi.fn(),
    getClientRects: () => visible ? [{}] : [],
    closest: () => hidden ? {} : null,
  } as unknown as HTMLElement;
}

function focusEvent(candidates: HTMLElement[]) {
  const event = {
    currentTarget: { querySelectorAll: vi.fn(() => candidates) },
    preventDefault: vi.fn(),
  } as unknown as Event;
  return event;
}

describe("shared dialog text-field focus", () => {
  it("focuses the first visible editable text field instead of a destructive action", () => {
    const hiddenTextField = field({ hidden: true });
    const invisibleTextField = field({ visible: false });
    const deleteConfirmation = field();
    const event = focusEvent([hiddenTextField, invisibleTextField, deleteConfirmation]);

    focusFirstDialogTextField(event);

    expect(deleteConfirmation.focus).toHaveBeenCalledOnce();
    expect(hiddenTextField.focus).not.toHaveBeenCalled();
    expect(invisibleTextField.focus).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("leaves Radix default initial focus intact when a dialog has no text field", () => {
    const event = focusEvent([]);

    focusFirstDialogTextField(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
