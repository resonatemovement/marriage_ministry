import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/features/onboarding/handoff-actions", () => ({ uploadPhonePhoto: mocks.upload }));

describe("photo handoff upload route", () => {
  beforeEach(() => mocks.upload.mockReset());

  it("returns uncached, no-referrer responses without echoing the bearer token", async () => {
    mocks.upload.mockResolvedValue({ success: false, error: "The photo handoff is no longer valid." });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://example.test/api/onboarding/photo-handoff/synthetic-token", { method: "POST", body: new Blob(["image"], { type: "image/jpeg" }) }), { params: Promise.resolve({ token: "synthetic-token" }) });

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain("synthetic-token");
  });

  it("uses the generic failure response if upload processing throws", async () => {
    const { POST } = await import("./route");
    const request = { blob: async () => { throw new Error("private internal detail"); } } as unknown as Request;
    const response = await POST(request, { params: Promise.resolve({ token: "synthetic-token" }) });
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).toContain("The photo could not be uploaded. Please try again.");
    expect(body).not.toContain("private internal detail");
    expect(body).not.toContain("synthetic-token");
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
