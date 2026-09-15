import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import { PROFILE_PHOTO_CONTENT_TYPE } from "./profile-photo-contract";

vi.mock("server-only", () => ({}));

describe("server profile photo conversion", () => {
  it("converts an original source image directly to AVIF", async () => {
    const { convertProfilePhotoToAvif } = await import("./profile-photo-server");
    const source = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#ffffff" } }).jpeg({ quality: 88 }).toBuffer();
    const result = await convertProfilePhotoToAvif(new File([source], "profile.jpg", { type: "image/jpeg" }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const avif = result.image;
    expect(PROFILE_PHOTO_CONTENT_TYPE).toBe("image/avif");
    expect((await sharp(avif).metadata()).format).toBe("heif");
  });
});
