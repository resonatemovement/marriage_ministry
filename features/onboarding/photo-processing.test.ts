import { describe, expect, it } from "vitest";

import { PROFILE_PHOTO_CONTENT_TYPE, profilePhotoPath, profilePhotoSourceError } from "./profile-photo-contract";

describe("profile photo pipeline", () => {
  it("accepts a valid image larger than 1 MB and smaller than 5 MB", () => {
    const image = new File([new Uint8Array(1_800_000)], "profile.jpg", { type: "image/jpeg" });
    expect(profilePhotoSourceError(image)).toBe("");
  });

  it("maps missing, oversized, and unsupported sources distinctly", () => {
    expect(profilePhotoSourceError(null)).toBe("Choose a profile photo before uploading.");
    expect(profilePhotoSourceError(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.jpg", { type: "image/jpeg" }))).toBe("Choose an image smaller than 5 MB.");
    expect(profilePhotoSourceError(new File(["text"], "profile.txt", { type: "text/plain" }))).toBe("Choose a JPG, PNG, WebP, or AVIF image.");
  });

  it("uses AVIF as the canonical destination without a browser intermediate", () => {
    expect(PROFILE_PHOTO_CONTENT_TYPE).toBe("image/avif");
    expect(profilePhotoPath("profile-id")).toBe("profiles/profile-id/avatar.avif");
  });
});
