import { describe, expect, it } from "vitest";

import { actionLabel, availablePeopleDetailActions, campusLeadCoachAssignmentUnavailable, campusLeadCoachEmptyMessage, counselingTeamsEmptyMessage, counselingTeamsUnavailable, counselorAssignmentLabel, eligibleCampusLeadCoachTeams, eligibleCounselorCoupleOptions, eligibleCoupleAssignmentTeams, eligibleCoupleOptions, eligibleUnassignedCounselorCoupleOptions, filterPeopleDetailActions, isAssignmentReadyCouple, isOperationalTeamReady, teamOptionLabel } from "./detail-actions-model";
import type { GroupPeopleDetail, ProfilePeopleDetail } from "./detail-model";

const context = {
  mode: "admin" as const,
  selfTarget: null,
  campusLeadTargets: [],
  campuses: [],
  counselorTeams: [],
  coachTeams: [],
  eligibleCounselingTeams: [],
  campusLeadCoachTeams: [],
  currentCounselorTeam: null,
  currentCounselorTeams: [],
  currentCampusLeadCoaches: [],
  currentCoachTeam: null,
  currentCoupleTeam: null,
  currentCoupleAssignmentType: null,
  coupleCampusId: null,
  coupleAssignmentReady: true,
  eligibleCouples: [],
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
  coachAssignment: null,
  counselorAssignment: null,
  campusLeadAssignment: null,
  supervisionSummary: "Not applicable",
  operationalStatuses: [],
  assignedCouples: [],
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
  member: { id: "admin", firstName: "Admin", lastName: "User", name: "Admin User", email: null, phone: null, roles: ["admin"], accountStatus: "Active", accountAccessState: "active_account", onboardingStatus: "Onboarding Complete", onboardingComplete: true, photoUrl: null },
};

describe("availablePeopleDetailActions", () => {
  it("labels initial and repeat generic assignment clearly", () => {
    expect(actionLabel("assign-team")).toBe("Assign");
    expect(actionLabel("reassign-team")).toBe("Assign");
  });

  it("builds one flat Campus Lead, Coach, and Counselor target list for staff modes", () => {
    const targets = eligibleCoupleAssignmentTeams({ ...context, mode: "admin", campusLeadTargets: [{ id: "lead", name: "Test Campus Lead", campus: "Fremont", type: "campus_lead" }], coachTeams: [{ id: "coach", name: "Coach Team", campus: "Fremont", type: "coach" }], counselorTeams: [{ id: "counselor", name: "Counselor Team", campus: "Fremont", type: "counselor" }] });
    expect(targets.map((target) => teamOptionLabel(target, true))).toEqual(["Test Campus Lead · Campus Lead · Fremont", "Coach Team · Coach · Fremont", "Counselor Team · Counselor · Fremont"]);
  });

  it("keeps Counselor summaries separate from Campus Lead and Coach targets", () => {
    expect(counselorAssignmentLabel(null)).toBe("Not assigned");
    expect(counselorAssignmentLabel({ id: "counselor", name: "Counselor Team", campus: "Fremont", type: "counselor" })).toBe("Counselor Team");
    expect(counselorAssignmentLabel({ id: "lead", name: "Campus Lead", campus: "Fremont", type: "campus_lead" })).toBe("Campus Lead");
    expect(counselorAssignmentLabel({ id: "coach", name: "Coach Team", campus: "Fremont", type: "coach" })).toBe("Coach Team");
  });
  it("resolves the generic Couple care-team action without falling through to Counselor-to-Coach actions", () => {
    expect(availablePeopleDetailActions(couple, context)).toEqual(["edit", "assign-team"]);
    expect(availablePeopleDetailActions(couple, { ...context, currentCoupleTeam: { id: "counselor", name: "Counselor", campus: null, type: "counselor" } })).toEqual(["edit", "reassign-team"]);
  });

  it("does not offer unassign in the Campus Lead workspace", () => {
    expect(availablePeopleDetailActions(couple, { ...context, mode: "campus_lead", currentCoupleTeam: { id: "counselor", name: "Counselor", campus: null, type: "counselor" } })).toEqual(["reassign-team"]);
  });

  it("uses the same readiness rule before exposing Couple-detail assignment actions", () => {
    expect(availablePeopleDetailActions(couple, { ...context, coupleAssignmentReady: false })).toEqual(["edit"]);
    expect(availablePeopleDetailActions(couple, { ...context, coupleAssignmentReady: false, currentCoupleTeam: { id: "counselor", name: "Counselor", campus: null, type: "counselor" } })).toEqual(["edit"]);
  });

  it("shows Assign Coach for an unsupervised Counselor and Reassign Coach once supervised", () => {
    expect(availablePeopleDetailActions(counselor, context)).toEqual(["edit", "assign-coach"]);
    expect(availablePeopleDetailActions(counselor, { ...context, currentCoachTeam: { id: "coach", name: "Coach", campus: null, type: "coach" } })).toEqual(["edit", "reassign-coach"]);
  });


  it("offers Counselor assignment on Coach teams while preserving profile behavior", () => {
    expect(availablePeopleDetailActions(coach, context)).toEqual(["edit", "assign-counselor"]);
    expect(availablePeopleDetailActions(admin, context)).toEqual(["edit"]);
  });

  it("uses the Campus Lead-specific Coach action without falling through to Counselor-to-Coach actions", () => {
    const campusLead = { ...couple, type: "campus_leads" as const, name: "Campus Lead Team" };
    expect(availablePeopleDetailActions(campusLead, context)).toEqual(["edit", "assign-campus-lead-coach"]);
  });

  it("scopes Campus Lead relationship-card actions to their relationship type", () => {
    const actions = availablePeopleDetailActions({ ...couple, type: "campus_leads" as const }, context);
    expect(filterPeopleDetailActions(actions, ["assign-campus-lead-coach"])).toEqual(["assign-campus-lead-coach"]);
  });

  it("scopes Counselor relationship-card actions to their relationship type", () => {
    const assignedCoachActions = availablePeopleDetailActions(counselor, {
      ...context,
      currentCoachTeam: { id: "coach-team-id", name: "Coach Team", type: "coach", campus: "Hayward" },
    });

    expect(filterPeopleDetailActions(assignedCoachActions, ["assign-coach", "reassign-coach"])).toEqual(["reassign-coach"]);
    expect(filterPeopleDetailActions(assignedCoachActions, ["assign-campus-lead-coach"])).toEqual([]);
  });
});

describe("Couple assignment targets", () => {
  it("requires two established, onboarded operational team members", () => {
    const member = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01" } };
    expect(isOperationalTeamReady([{ ended_at: null, profile: { status: "active", onboarding_completed_at: null } }, { ended_at: null, profile: { status: "active", onboarding_completed_at: null } }])).toBe(true);
    expect(isOperationalTeamReady([member, { ended_at: null, profile: { status: "invited", onboarding_completed_at: null } }])).toBe(false);
    expect(isOperationalTeamReady([member, member], ["pending"])).toBe(false);
  });
  it("only treats two active, onboarded members as assignment-ready", () => {
    const member = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01" } };
    expect(isAssignmentReadyCouple([member, member])).toBe(true);
    expect(isAssignmentReadyCouple([member, { ended_at: null, profile: { status: "invited", onboarding_completed_at: null } }])).toBe(false);
    expect(isAssignmentReadyCouple([member])).toBe(false);
    expect(isAssignmentReadyCouple([{ ended_at: "2026-01-01", profile: member.profile }, member])).toBe(false);
  });

  it("builds options only from established active Couples", () => {
    const ready = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01" } };
    expect(eligibleCoupleOptions([
      { id: "ready", name: "Ready Couple", group_members: [ready, ready] },
      { id: "pending", name: "Pending Couple invitation", group_members: [ready, ready], invitations: [{ status: "pending" }] },
    ])).toEqual([{ id: "ready", name: "Ready Couple" }]);
  });
  it("keeps Coach- and Campus Lead-assigned Couples eligible for a Counselor", () => {
    const ready = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01" } };
    expect(eligibleCounselorCoupleOptions([
      { id: "coach", name: "Coach Couple", group_members: [ready, ready], case_assignments: [{ assignment_type: "coach", assigned_group_id: "coach-team", ended_at: null }] },
      { id: "lead", name: "Campus Lead Couple", group_members: [ready, ready], case_assignments: [{ assignment_type: "campus_lead", assigned_group_id: "campus-lead-team", ended_at: null }] },
    ])).toEqual([{ id: "coach", name: "Coach Couple" }, { id: "lead", name: "Campus Lead Couple" }]);
  });
  it("excludes every Couple with an active Counselor-of-record", () => {
    const ready = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01" } };
    expect(eligibleCounselorCoupleOptions([
      { id: "counselor", name: "Counselor Team", group_members: [ready, ready], case_assignments: [{ assignment_type: "counselor", assigned_group_id: "counselor-team", ended_at: null }] },
      { id: "coach", name: "Coach Team", group_members: [ready, ready], case_assignments: [{ assignment_type: "counselor", assigned_group_id: "coach-team", ended_at: null }] },
      { id: "campus-lead", name: "Campus Lead Team", group_members: [ready, ready], case_assignments: [{ assignment_type: "counselor", assigned_group_id: "campus-lead-team", ended_at: null }] },
      { id: "unassigned", name: "Unassigned Couple", group_members: [ready, ready], case_assignments: [] },
    ])).toEqual([{ id: "unassigned", name: "Unassigned Couple" }]);
  });
  it("keeps a ready Couple with only historical Counselor-of-record assignments eligible", () => {
    const ready = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01" } };
    expect(eligibleUnassignedCounselorCoupleOptions([
      { id: "historical", name: "Previously counseled", group_members: [ready, ready], case_assignments: [{ assignment_type: "counselor", ended_at: "2026-09-11" }] },
      { id: "unassigned", name: "Unassigned", group_members: [ready, ready], case_assignments: [] },
    ])).toEqual([{ id: "historical", name: "Previously counseled" }, { id: "unassigned", name: "Unassigned" }]);
  });
  it("keeps Couple-to-team and Team-to-Couple candidates in parity without a counseling case", () => {
    const ready = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01", first_name: "Ready", last_name: "Member", email: "ready@example.com", campus_id: "fremont", phone: "+15555550100", photo_path: "profiles/ready/avatar.avif" } };
    const couple = { id: "richard-anna", name: "Richard Price & Anna Lee", group_members: [ready, ready] };
    const targets = eligibleCoupleAssignmentTeams({ ...context, coupleCampusId: "fremont", coachTeams: [{ id: "dev-coach", name: "DEV Test Coach Team", campus: "Fremont", campusId: "fremont", type: "coach" }], counselorTeams: [{ id: "dev-counselor", name: "DEV Test Counselor Team", campus: "Fremont", campusId: "fremont", type: "counselor" }], campusLeadTargets: [{ id: "dev-lead", name: "DEV Test Campus Lead Team", campus: "Fremont", campusId: "fremont", type: "campus_lead" }] });
    expect(targets.map((target) => target.type)).toEqual(["campus_lead", "coach", "counselor"]);
    expect(eligibleUnassignedCounselorCoupleOptions([couple])).toEqual([{ id: "richard-anna", name: "Richard Price & Anna Lee" }]);
  });
  it("excludes incomplete Coach teams from Couple-side targets", () => {
    const incomplete = { ended_at: null, profile: { status: "active", onboarding_completed_at: "2026-01-01", first_name: "Ready", last_name: "Member", email: "ready@example.com", campus_id: "fremont", phone: "+15555550100", photo_path: null } };
    expect(isOperationalTeamReady([incomplete, incomplete])).toBe(false);
  });
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

  it("places the Campus Lead team target before same-campus team targets", () => {
    const targets = eligibleCoupleAssignmentTeams({ ...context, mode: "campus_lead", selfTarget: { id: "campus-lead-team", name: "Fremont Campus Lead Team", campus: "Fremont", type: "campus_lead" }, coachTeams: [{ id: "coach", name: "Fremont Coach", campus: "Fremont", type: "coach" }], counselorTeams: [{ id: "counselor", name: "Fremont Counselor", campus: "Fremont", type: "counselor" }] });
    expect(targets.map((target) => target.id)).toEqual(["campus-lead-team", "coach", "counselor"]);
    expect(teamOptionLabel(targets[0], true)).toBe("Fremont Campus Lead Team · Campus Lead · Fremont");
  });
  it("keeps all ready Counselor-of-record team types available across campuses", () => {
    const targets = eligibleCoupleAssignmentTeams({ ...context, coupleCampusId: "fremont", campusLeadTargets: [{ id: "lead", name: "Fremont Campus Lead Team", campus: "Fremont", campusId: "fremont", type: "campus_lead" }, { id: "other-lead", name: "Campus A Lead", campus: "Campus A", campusId: "campus-a", type: "campus_lead" }], coachTeams: [{ id: "coach", name: "Fremont Coach Team", campus: "Fremont", campusId: "fremont", type: "coach" }, { id: "other-coach", name: "Campus A Coach Team", campus: "Campus A", campusId: "campus-a", type: "coach" }], counselorTeams: [{ id: "counselor", name: "Fremont Counselor Team", campus: "Fremont", campusId: "fremont", type: "counselor" }] });
    expect(targets.map((target) => target.id)).toEqual(["lead", "other-lead", "other-coach", "coach", "counselor"]);
    expect(teamOptionLabel(targets[1], true)).toBe("Campus A Lead · Campus Lead · Campus A");
    expect(teamOptionLabel(targets[2], true)).toBe("Campus A Coach Team · Coach · Campus A");
  });

  it("disables Couple assignment only when the shared counseling candidate list is empty", () => {
    expect(counselingTeamsUnavailable([])).toBe(true);
    expect(counselingTeamsUnavailable([{ id: "fremont-coach", name: "Fremont Coach", campus: "Fremont", campusId: "fremont", type: "coach" }])).toBe(false);
    expect(counselingTeamsEmptyMessage()).toBe("No eligible counseling teams are currently available.");
  });
});

describe("Campus Lead Coach assignment targets", () => {
  it("keeps only ready Coaches at the Campus Lead campus", () => {
    const eligible = eligibleCampusLeadCoachTeams([
      { id: "hayward", name: "Hayward Coach Team", campus: "Hayward", campusId: "hayward", type: "coach" },
      { id: "fremont", name: "Fremont Coach Team", campus: "Fremont", campusId: "fremont", type: "coach" },
      { id: "inactive", name: "Inactive Hayward Coach Team", campus: "Hayward", campusId: "hayward", type: "coach", active: false },
    ], "hayward");

    expect(eligible.map((team) => team.id)).toEqual(["hayward"]);
  });

  it("excludes Coaches already assigned to any Campus Lead", () => {
    const eligible = eligibleCampusLeadCoachTeams([
      { id: "current", name: "Current Lead Coach", campus: "Fremont", campusId: "fremont", type: "coach" },
      { id: "other", name: "Other Lead Coach", campus: "Fremont", campusId: "fremont", type: "coach" },
      { id: "available", name: "Available Coach", campus: "Fremont", campusId: "fremont", type: "coach" },
    ], "fremont", ["current", "other"]);
    expect(eligible.map((team) => team.id)).toEqual(["available"]);
  });

  it("provides a campus-specific empty-state message when no same-campus Coach is eligible", () => {
    const eligible = eligibleCampusLeadCoachTeams([{ id: "fremont", name: "Fremont Coach Team", campus: "Fremont", campusId: "fremont", type: "coach" }], "hayward");
    expect(eligible).toEqual([]);
    expect(campusLeadCoachAssignmentUnavailable(eligible)).toBe(true);
    expect(campusLeadCoachEmptyMessage("Hayward")).toBe("No eligible coaches are available at the Hayward campus.");
  });
});
