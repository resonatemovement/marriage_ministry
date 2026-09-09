import { describe, expect, it } from "vitest";

import { nextPhonePhotoStage, phonePhotoStageIsBusy } from "./phone-photo-state";

describe("phone photo selection states", () => {
  it("moves a selected camera or library file into preview before upload", () => {
    expect(nextPhonePhotoStage("select")).toBe("processing");
    expect(nextPhonePhotoStage("prepared")).toBe("preview");
  });

  it("keeps failure retryable and success terminal", () => {
    expect(nextPhonePhotoStage("failed")).toBe("error");
    expect(nextPhonePhotoStage("uploaded")).toBe("completed");
  });

  it("only disables controls while processing or uploading", () => {
    expect(phonePhotoStageIsBusy("processing")).toBe(true);
    expect(phonePhotoStageIsBusy("uploading")).toBe(true);
    expect(phonePhotoStageIsBusy("preview")).toBe(false);
    expect(phonePhotoStageIsBusy("completed")).toBe(false);
  });
});
