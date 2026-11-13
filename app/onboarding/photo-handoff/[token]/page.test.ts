import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PhotoHandoffPage, { metadata } from "./page";
import { validatePhotoHandoff } from "@/features/onboarding/handoff-actions";

vi.mock("@/features/onboarding/handoff-actions", () => ({ validatePhotoHandoff: vi.fn() }));
vi.mock("@/features/onboarding/photo-handoff", () => ({
  PhonePhotoUpload: ({ token }: { token: string }) => createElement("div", { "data-camera-token": token }, "Existing camera interface"),
}));

const testToken = "synthetic-handoff-test-token";

describe("photo handoff route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("prevents indexing and token referrer propagation", () => {
    expect(metadata.referrer).toBe("no-referrer");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([
    ["expired", "This photo handoff has expired."],
    ["completed", "This photo handoff has already been completed."],
    ["invalid or replaced", "This photo handoff is no longer valid."],
  ])("shows safe recovery guidance for %s links", async (_state, error) => {
    vi.mocked(validatePhotoHandoff).mockResolvedValue({ valid: false, error });

    const markup = renderToStaticMarkup(await PhotoHandoffPage({ params: Promise.resolve({ token: testToken }) }));

    expect(markup).toContain("Photo link unavailable");
    expect(markup).toContain("Return to your desktop and generate a new QR code to continue.");
    expect(markup).not.toContain("synthetic-handoff-test-token");
    expect(markup).not.toContain(error);
    expect(markup).not.toContain("Sign in");
    expect(markup).toContain("px-4 py-10");
    expect(markup).toContain("sm:px-6");
    expect(markup).not.toMatch(/<a\b/i);
    expect(validatePhotoHandoff).toHaveBeenCalledWith(testToken);
  });

  it("keeps the existing camera interface for a valid handoff", async () => {
    vi.mocked(validatePhotoHandoff).mockResolvedValue({ valid: true });

    const markup = renderToStaticMarkup(await PhotoHandoffPage({ params: Promise.resolve({ token: testToken }) }));

    expect(markup).toContain("Existing camera interface");
    expect(markup).toContain('data-camera-token="synthetic-handoff-test-token"');
  });
});
