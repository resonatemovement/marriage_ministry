import { describe, expect, it } from "vitest";
import { canExportSessionMaterials, contentDispositionInline, resourceOpenUrl, safeHttpUrl, sanitizeSessionPdfFilename } from "./model";

describe("Session Materials export authorization and URL helpers", () => {
  const access = {
    coupleCaseId: null,
    assignments: [{ assignmentType: "counselor" as const, assignedGroupId: "team-1", assignedProfileId: null, endedAt: null }],
    teams: [{ id: "team-1", type: "counselor_team", active: true }],
    memberships: [{ groupId: "team-1", profileId: "counselor-1", endedAt: null }],
  };

  it("allows only the Couple's own Case or an active assigned team member", () => {
    expect(canExportSessionMaterials({ id: "partner-a", roles: ["couple"] }, "case-1", { ...access, coupleCaseId: "case-1", assignments: [], teams: [], memberships: [] })).toBe(true);
    expect(canExportSessionMaterials({ id: "partner-a", roles: ["couple"] }, "case-2", { ...access, coupleCaseId: "case-1" })).toBe(false);
    expect(canExportSessionMaterials({ id: "counselor-1", roles: ["counselor"] }, "case-1", access)).toBe(true);
    expect(canExportSessionMaterials({ id: "other-counselor", roles: ["counselor"] }, "case-1", access)).toBe(false);
    expect(canExportSessionMaterials({ id: "counselor-1", roles: ["counselor"] }, "case-1", { ...access, assignments: [{ ...access.assignments[0], endedAt: "2026-01-01" }] })).toBe(false);
  });

  it("supports a Coach fulfilling the active Counselor-of-record assignment only through their own active Coach team", () => {
    const coachAccess = { ...access, teams: [{ id: "team-1", type: "coach_team", active: true }] };
    expect(canExportSessionMaterials({ id: "coach-1", roles: ["coach"] }, "case-1", { ...coachAccess, memberships: [{ groupId: "team-1", profileId: "coach-1", endedAt: null }] })).toBe(true);
    expect(canExportSessionMaterials({ id: "coach-1", roles: ["coach"] }, "case-1", access)).toBe(false);
  });

  it("sanitizes the PDF filename and builds an authorized, version-pinned Resource route", () => {
    expect(sanitizeSessionPdfFilename("../Couples: Connection? ")).toBe("Couples Connection.pdf");
    expect(contentDispositionInline("Session.pdf")).toContain('inline; filename="Session.pdf"');
    expect(resourceOpenUrl("https://app.example", "resource/1", "version-2")).toBe("https://app.example/resource-library/resource%2F1/open?version=version-2");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://user:secret@example.com")).toBeNull();
  });
});
