import { describe, expect, it, vi } from "vitest";

import { attachPhotoChangeListener, isSupportedPhonePhoto, selectedPhonePhoto } from "./phone-photo-selection";

describe("phone photo selection", () => {
  it("copies the selected file before the input is reset", () => {
    const file = { name: "selected.heic", type: "image/heic", size: 42 } as File;
    expect(selectedPhonePhoto({ item: (index) => index === 0 ? file : null })).toBe(file);
  });

  it("accepts extension-known image files with an empty MIME type for normal validation", () => {
    expect(isSupportedPhonePhoto({ name: "IMG_001.HEIC", type: "", size: 42 })).toBe(true);
    expect(isSupportedPhonePhoto({ name: "document.pdf", type: "application/pdf", size: 42 })).toBe(false);
  });

  it("attaches and cleans up the library photo change listener", () => {
    let listener: (() => void) | undefined;
    let file: File | null = null;
    const input = {
      value: "",
      files: { item: () => file },
      addEventListener: (_name: string, callback: EventListenerOrEventListenerObject) => { listener = callback as () => void; },
      removeEventListener: (_name: string, callback: EventListenerOrEventListenerObject) => { if (listener === callback) listener = undefined; },
    } as unknown as HTMLInputElement;
    const received: File[] = [];
    input.value = "old-selection.jpg";
    const cleanup = attachPhotoChangeListener(input, (selected) => { if (selected) received.push(selected); });
    file = { name: "selected.heic", type: "image/heic", size: 42 } as File;
    listener?.();
    input.value = "IMG_001.HEIC";
    listener?.();
    expect(received).toHaveLength(2);
    expect(input.value).toBe("");
    cleanup();
    expect(listener).toBeUndefined();
  });

  it("resets a canceled or empty selection without reporting a photo", () => {
    let listener: (() => void) | undefined;
    const input = {
      value: "stale-selection.jpg",
      files: { item: () => null },
      addEventListener: (_name: string, callback: EventListenerOrEventListenerObject) => { listener = callback as () => void; },
      removeEventListener: () => { listener = undefined; },
    } as unknown as HTMLInputElement;
    const onFile = vi.fn();
    const cleanup = attachPhotoChangeListener(input, onFile);

    listener?.();

    expect(input.value).toBe("");
    expect(onFile).toHaveBeenCalledWith(null);
    cleanup();
  });
});
