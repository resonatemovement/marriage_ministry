import { describe, expect, it, vi } from "vitest";

const authorized = vi.hoisted(() => vi.fn());
const pdf = vi.hoisted(() => vi.fn());
vi.mock("@/features/session-materials-export/server", () => ({ getAuthorizedSessionMaterials: authorized }));
vi.mock("@/features/session-materials-export/pdf", () => ({ buildSessionMaterialsPdf: pdf, contentDispositionInline: (value: string) => `inline; filename="${value}"` }));

import { GET } from "./route";

describe("Session Materials PDF route", () => {
  it("returns the same not-found response for unauthorized Sessions and does not generate content", async () => {
    authorized.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://app.example/api"), { params: Promise.resolve({ caseSessionId: "8ce4f24e-f644-47bc-bde8-1860e53af28b" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(pdf).not.toHaveBeenCalled();
  });

  it("serves a private inline PDF without caching", async () => {
    process.env.APP_URL = "https://app.example";
    authorized.mockResolvedValueOnce({ title: "Connection", blocks: [] });
    pdf.mockResolvedValueOnce({ bytes: Buffer.from("%PDF"), filename: "Connection.pdf" });
    const response = await GET(new Request("https://app.example/api/case-sessions/id/materials-pdf"), { params: Promise.resolve({ caseSessionId: "8ce4f24e-f644-47bc-bde8-1860e53af28b" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
