import { describe, expect, it } from "vitest";

import { buildOperationalHierarchy, type OperationalHierarchyTeam } from "./operational-hierarchy-model";

const team = (id: string, role: OperationalHierarchyTeam["role"]): OperationalHierarchyTeam => ({ id, role, name: id, campus: "Fremont", photoUrl: null });

describe("operational hierarchy", () => {
  it("places counselors under their coach before their Campus Lead", () => {
    const hierarchy = buildOperationalHierarchy([team("lead", "campus_lead"), team("coach", "coach"), team("counselor", "counselor")], [{ campusLeadId: "lead", coachId: "coach" }], [{ campusLeadId: "lead", counselorId: "counselor" }], [{ coachId: "coach", counselorId: "counselor" }]);
    expect(hierarchy.campusLeads[0]?.coaches[0]?.counselors.map((item) => item.id)).toEqual(["counselor"]);
    expect(hierarchy.campusLeads[0]).not.toHaveProperty("counselors");
  });

  it("omits a Counselor without a coach from the operational hierarchy", () => {
    const hierarchy = buildOperationalHierarchy([team("lead", "campus_lead"), team("counselor", "counselor")], [], [{ campusLeadId: "lead", counselorId: "counselor" }], []);
    expect(hierarchy.campusLeads[0]?.coaches).toEqual([]);
  });

  it("excludes couples and never retypes operational teams as counselors", () => {
    const hierarchy = buildOperationalHierarchy([team("lead", "campus_lead"), team("coach", "coach")], [{ campusLeadId: "lead", coachId: "coach" }], [], []);
    expect(hierarchy.campusLeads[0]?.coaches[0]).toMatchObject({ id: "coach", role: "coach", counselors: [] });
  });

  it("handles a Campus Lead with no operational children", () => {
    expect(buildOperationalHierarchy([team("lead", "campus_lead")], [], [], []).campusLeads[0]).toMatchObject({ id: "lead", coaches: [] });
  });
});
