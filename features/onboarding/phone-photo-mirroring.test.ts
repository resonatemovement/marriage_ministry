import { afterEach, describe, expect, it, vi } from "vitest";
import { preparePhonePhoto } from "./phone-photo-mirroring";

describe("native phone selfie mirroring", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mirrors decoded pixels once at native dimensions and returns the exact preview/upload file", async () => {
    const source = new File(["camera photo"], "selfie.jpg", { type: "image/jpeg", lastModified: 123 });
    const image = { naturalWidth: 1200, naturalHeight: 1600, onload: null as (() => void) | null, onerror: null as (() => void) | null };
    class MockImage {
      naturalWidth = image.naturalWidth;
      naturalHeight = image.naturalHeight;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        expect(value).toBe("blob:source-photo");
        this.onload?.();
      }
    }
    const drawImage = vi.fn();
    const setTransform = vi.fn();
    const toBlob = vi.fn((callback: BlobCallback) => callback(new Blob(["mirrored pixels"], { type: "image/webp" })));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage, setTransform }), toBlob };
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source-photo");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });

    const mirrored = await preparePhonePhoto(source, "native-camera");

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1600);
    expect(setTransform).toHaveBeenCalledOnce();
    expect(setTransform).toHaveBeenCalledWith(-1, 0, 0, 1, 1200, 0);
    expect(drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 1200, 1600);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.92);
    expect(mirrored.type).toBe("image/webp");
    expect(mirrored.lastModified).toBe(source.lastModified);
    expect(await mirrored.text()).toBe("mirrored pixels");
    expect(revoke).toHaveBeenCalledWith("blob:source-photo");
  });

  it("fails safely if the decoded image or canvas cannot be processed", async () => {
    const source = new File(["camera photo"], "selfie.jpg", { type: "image/jpeg" });
    class BrokenImage {
      naturalWidth = 0;
      naturalHeight = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { this.onload?.(); }
    }
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:source-photo");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("Image", BrokenImage);

    await expect(preparePhonePhoto(source, "native-camera")).rejects.toThrow("The photo could not be prepared.");
  });

  it("preserves a library selection exactly without decoding or transforming it", async () => {
    const source = new File(["chosen photo"], "library.jpg", { type: "image/jpeg" });
    const createObjectURL = vi.spyOn(URL, "createObjectURL");

    await expect(preparePhonePhoto(source, "library")).resolves.toBe(source);
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
