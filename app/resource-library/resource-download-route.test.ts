import { describe, expect, it, vi } from "vitest";

const { signedResourceAccess } = vi.hoisted(() => ({ signedResourceAccess: vi.fn() }));
vi.mock("@/features/resource-library/server", () => ({ signedResourceAccess }));

import { GET } from "./[resourceId]/download/route";

describe("Resource private download redirect", () => {
  it("redirects the same-origin browser request to the signed current-version attachment URL", async () => {
    signedResourceAccess.mockResolvedValue({ signedUrl: "https://storage.example/private-signed-url" });
    const response = await GET(new Request("https://app.example/resource-library/resource-1/download"), { params: Promise.resolve({ resourceId: "resource-1" }) });

    expect(signedResourceAccess).toHaveBeenCalledWith("resource-1", { download: true });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://storage.example/private-signed-url");
    expect(await response.text()).toBe("");
  });

  it("returns failed or unauthorized preparation to the Library without exposing server details", async () => {
    signedResourceAccess.mockRejectedValue(new Error("Not authorized"));
    const response = await GET(new Request("https://app.example/resource-library/hidden/download"), { params: Promise.resolve({ resourceId: "hidden" }) });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://app.example/resource-library?downloadError=1");
    expect(await response.text()).toBe("");
  });
});
