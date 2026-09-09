import { describe, expect, it } from "vitest";

import { availablePeopleDetailActions, eligibleCoupleAssignmentTeams, teamOptionLabel } from "./detail-actions-model";
import type { GroupPeopleDetail, ProfilePeopleDetail } from "./detail-model";

const context = {
  campuses: [],
  counselorTeams: [],
  coachTeams: [],
  currentCounselorTeam: null,
  currentCoachTeam: null,
  currentCoupleTeam: null,
  currentCoupleAssignmentType: null,
};

const couple: GroupPeopleDetail = {
  kind: "group",
  id: "couple",
  type: "couples",
  name: "Couple",
  campusId: null,
  campus: null,
  updatedAt: "2026-08-23T00:00:00.000Z",
  members: [],
  counselingStatus: "requested",
  activeAssignmentCount: 0,
  assignmentSummary: "No active assignments",
  supervisionSummary: "Not applicable",
  operationalStatuses: [],
};

const counselor: GroupPeopleDetail = { ...couple, id: "counselor", type: "counselors", name: "Counselor", counselingStatus: null };
const coach: GroupPeopleDetail = { ...couple, id: "coach", type: "coaches", name: "Coach", counselingStatus: null };
const admin: ProfilePeopleDetail = {
  kind: "profile",
  id: "admin",
  type: "admins",
  name: "Admin",
  campusId: null,
  campus: null,
  updatedAt: "2026-08-23T00:00:00.000Z",
  member: { id: "admin", firstName: "Admin", lastName: "User", name: "Admin User", email: null, phone: null, roles: ["admin"], accountStatus: "Active", onboardingStatus: "Profile Ready", photoUrl: null },
};

describe("availablePeopleDetailActions", () => {
  it("shows Assign Team for an unassigned Couple and Reassign Team once assigned", () => {
    expect(availablePeopleDetailActions(couple, context)).toEqual(["edit", "assign-team"]);
    expect(availablePeopleDetailActions(couple, { ...context, currentCoupleTeam: { id: "counselor", name: "Counselor", campus: null, type: "counselor" } })).toEqual(["edit", "reassign-team"]);
  });

  it("shows Assign Coach for an unsupervised Counselor and Reassign Coach once supervised", () => {
    expect(availablePeopleDetailActions(counselor, context)).toEqual(["edit", "assign-coach"]);
    expect(availablePeopleDetailActions(counselor, { ...context, currentCoachTeam: { id: "coach", name: "Coach", campus: null, type: "coach" } })).toEqual(["edit", "reassign-coach"]);
  });

  it("does not expose unsupported assignment actions for Coach teams or standalone profiles", () => {
    expect(availablePeopleDetailActions(coach, context)).toEqual(["edit"]);
    expect(availablePeopleDetailActions(admin, context)).toEqual(["edit"]);
  });
});

describe("Couple assignment targets", () => {
  it("includes active Coach and Counselor teams, excludes inactive targets, and labels types", () => {
    const targets = eligibleCoupleAssignmentTeams({
      ...context,
      coachTeams: [{ id: "coach", name: "Walker Team", campus: "Fremont", type: "coach" }, { id: "inactive", name: "Old Team", campus: null, type: "coach", active: false }],
      counselorTeams: [{ id: "counselor", name: "Chen Team", campus: "Fremont", type: "counselor" }],
    });
    expect(targets.map((team) => team.id)).toEqual(["counselor", "coach"]);
    expect(teamOptionLabel(targets[0], true)).toBe("Chen Team · Counselor · Fremont");
    expect(teamOptionLabel(targets[1], true)).toBe("Walker Team · Coach · Fremont");
  });
});
