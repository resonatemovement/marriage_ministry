import { describe, expect, it } from "vitest";

import { attachNativePhotoChangeListener, isSupportedPhonePhoto, selectedPhonePhoto } from "./phone-photo-selection";

describe("phone photo selection", () => {
  it("copies the selected file before the native input is reset", () => {
    const file = { name: "camera.heic", type: "image/heic", size: 42 } as File;
    expect(selectedPhonePhoto({ item: (index) => index === 0 ? file : null })).toBe(file);
  });

  it("accepts iPhone camera files with an empty MIME type when the extension is known", () => {
    expect(isSupportedPhonePhoto({ name: "IMG_001.HEIC", type: "", size: 42 })).toBe(true);
    expect(isSupportedPhonePhoto({ name: "document.pdf", type: "application/pdf", size: 42 })).toBe(false);
  });

  it("attaches and cleans up one native change listener", () => {
    let listener: (() => void) | undefined;
    let file: File | null = null;
    const input = {
      files: { item: () => file },
      addEventListener: (_name: string, callback: EventListenerOrEventListenerObject) => { listener = callback as () => void; },
      removeEventListener: (_name: string, callback: EventListenerOrEventListenerObject) => { if (listener === callback) listener = undefined; },
    } as unknown as HTMLInputElement;
    const received: File[] = [];
    const cleanup = attachNativePhotoChangeListener(input, (selected) => { if (selected) received.push(selected); });
    file = { name: "camera.heic", type: "image/heic", size: 42 } as File;
    listener?.();
    expect(received).toHaveLength(1);
    cleanup();
    expect(listener).toBeUndefined();
  });
});
