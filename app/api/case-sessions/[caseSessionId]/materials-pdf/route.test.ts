import { beforeEach, describe, expect, it, vi } from "vitest";

const authorized = vi.hoisted(() => vi.fn());
const pdf = vi.hoisted(() => vi.fn());
vi.mock("@/features/session-materials-export/server", () => ({ getAuthorizedSessionMaterials: authorized }));
vi.mock("@/features/session-materials-export/pdf", () => ({ buildSessionMaterialsPdf: pdf }));

import { GET } from "./route";

describe("Session Materials PDF route", () => {
  beforeEach(() => { authorized.mockReset(); pdf.mockReset(); });

  it.each(["", "?download=1"])("returns the same not-found response for unauthorized Sessions and does not generate content %s", async (query) => {
    authorized.mockResolvedValueOnce(null);
    const response = await GET(new Request(`https://app.example/api${query}`), { params: Promise.resolve({ caseSessionId: "8ce4f24e-f644-47bc-bde8-1860e53af28b" }) });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(pdf).not.toHaveBeenCalled();
  });

  it.each([
    ["", "inline"],
    ["?download=1", "attachment"],
  ])("serves a private %s PDF without caching", async (query, disposition) => {
    process.env.APP_URL = "https://app.example";
    authorized.mockResolvedValueOnce({ title: "Connection", blocks: [{ id: "snapshot-block" }] });
    pdf.mockResolvedValueOnce({ bytes: Buffer.from("%PDF"), filename: "Couples Connection.pdf" });
    const response = await GET(new Request(`https://app.example/api/case-sessions/id/materials-pdf${query}`), { params: Promise.resolve({ caseSessionId: "8ce4f24e-f644-47bc-bde8-1860e53af28b" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(`${disposition}; filename="Couples Connection.pdf"`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(pdf).toHaveBeenCalledWith("Connection", [{ id: "snapshot-block" }], "https://app.example");
  });

  it("returns a private generic error without exposing details when PDF preparation fails", async () => {
    authorized.mockRejectedValueOnce(new Error("private database detail"));
    const response = await GET(new Request("https://app.example/api/case-sessions/8ce4f24e-f644-47bc-bde8-1860e53af28b/materials-pdf?download=1"), { params: Promise.resolve({ caseSessionId: "8ce4f24e-f644-47bc-bde8-1860e53af28b" }) });
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("private database detail");
    expect(pdf).not.toHaveBeenCalled();
  });
});
