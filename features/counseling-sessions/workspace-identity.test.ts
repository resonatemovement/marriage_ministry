import { describe, expect, it } from "vitest";

import { counselingWorkspaceCoupleIdentity } from "./workspace-identity";

describe("counseling workspace Couple identity", () => {
  it("maps the case-scoped projection to real Couple names and photo paths", () => {
    const identity = counselingWorkspaceCoupleIdentity([
      { counseling_case_id: "case-1", couple_group_id: "couple-1", group_name: "John Smith & Stacy Miller", profile_id: "john", first_name: "John", last_name: "Smith", photo_path: "john.jpg" },
      { counseling_case_id: "case-1", couple_group_id: "couple-1", group_name: "John Smith & Stacy Miller", profile_id: "stacy", first_name: "Stacy", last_name: "Miller", photo_path: "stacy.jpg" },
    ]);
    expect(identity).toEqual({
      caseId: "case-1",
      coupleId: "couple-1",
      coupleName: "John Smith & Stacy Miller",
      partners: [{ id: "john", firstName: "John", name: "John Smith", photoPath: "john.jpg" }, { id: "stacy", firstName: "Stacy", name: "Stacy Miller", photoPath: "stacy.jpg" }],
    });
    expect(identity.coupleName).not.toContain("Pending Couple invitation");
  });

  it("uses the saved Couple name while preserving partner identities", () => {
    const identity = counselingWorkspaceCoupleIdentity([
      { counseling_case_id: "case-1", couple_group_id: "couple-1", group_name: "Lee Family", profile_id: "john", first_name: "John", last_name: "Smith", photo_path: "john.jpg" },
      { counseling_case_id: "case-1", couple_group_id: "couple-1", group_name: "Lee Family", profile_id: "stacy", first_name: "Stacy", last_name: "Miller", photo_path: "stacy.jpg" },
    ]);
    expect(identity.coupleName).toBe("Lee Family");
    expect(identity.partners.map(({ name }) => name)).toEqual(["John Smith", "Stacy Miller"]);
  });

  it("rejects incomplete or cross-case identity rather than inventing fallback text", () => {
    expect(() => counselingWorkspaceCoupleIdentity([])).toThrow("identity is incomplete");
    expect(() => counselingWorkspaceCoupleIdentity([
      { counseling_case_id: "case-1", couple_group_id: "couple-1", group_name: "John Smith & Stacy Miller", profile_id: "john", first_name: "John", last_name: "Smith", photo_path: null },
      { counseling_case_id: "case-2", couple_group_id: "couple-1", group_name: "John Smith & Stacy Miller", profile_id: "stacy", first_name: "Stacy", last_name: "Miller", photo_path: null },
    ])).toThrow("identity is inconsistent");
  });
});
