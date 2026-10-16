import { beforeEach, describe, expect, it, vi } from "vitest";

const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("sonner", () => ({ toast: toastMocks }));

import { showErrorToast, showSuccessToast } from "./toast";

describe("shared toast helpers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows caller-provided success messages for four seconds", () => {
    showSuccessToast("Settings saved successfully.");

    expect(toastMocks.success).toHaveBeenCalledWith("Settings saved successfully.", { duration: 4000 });
  });

  it("shows caller-provided safe error messages for six seconds", () => {
    showErrorToast("Unable to save settings. Please try again.");

    expect(toastMocks.error).toHaveBeenCalledWith("Unable to save settings. Please try again.", { duration: 6000 });
  });
});
