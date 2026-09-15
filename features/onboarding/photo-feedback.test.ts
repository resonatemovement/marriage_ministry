import { describe, expect, it } from "vitest";

import { photoSelectionFeedback, photoUploadFailed, photoUploadStarted, photoUploadSucceeded, PHOTO_UPLOAD_SUCCESS } from "./photo-feedback";

describe("Admin recovery photo feedback", () => {
  it("shows one success state without an error message", () => {
    expect(photoUploadSucceeded()).toEqual({ success: true, error: "" });
    expect(PHOTO_UPLOAD_SUCCESS).toBe("Photo uploaded. You can now complete onboarding.");
  });

  it("shows only the upload error after failure", () => {
    expect(photoUploadFailed("The profile photo could not be uploaded.")).toEqual({ success: false, error: "The profile photo could not be uploaded." });
  });

  it("clears stale feedback when a new attempt or selection begins", () => {
    expect(photoUploadStarted()).toEqual({ success: false, error: "" });
    expect(photoSelectionFeedback("")).toEqual({ success: false, error: "" });
    expect(photoSelectionFeedback("Choose a profile photo before uploading.")).toEqual({ success: false, error: "Choose a profile photo before uploading." });
  });
});
