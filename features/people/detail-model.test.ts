import { describe, expect, it } from "vitest";

import { createDetailMember, groupOperationalStatuses, groupRecordType, standaloneProfileRecordType } from "./detail-model";

const activeMember = createDetailMember({
  id: "active-member",
  firstName: "Active",
  lastName: "Member",
  email: "active@example.com",
  roles: ["coach"],
  status: "active",
});

describe("People detail member presentation", () => {
  it("uses a neutral placeholder and clear pending state for an invited member", () => {
    const member = createDetailMember({
      id: "invited-member",
      firstName: "Invited",
      lastName: "Member",
      email: "invited@example.com",
      roles: ["couple"],
      status: "invited",
    });

    expect(member.photoUrl).toBeNull();
    expect(member.accountStatus).toBe("Invitation Sent");
    expect(member.onboardingStatus).toBe("Profile Not Started");
  });
});

describe("People detail operational statuses", () => {
  it("keeps couple readiness and counselor assignment separate", () => {
    const invitedPartner = createDetailMember({
      id: "invited-partner",
      firstName: "Invited",
      lastName: "Partner",
      email: "partner@example.com",
      roles: ["couple"],
      status: "invited",
    });

    expect(groupOperationalStatuses({ type: "couples", members: [activeMember, invitedPartner], activeAssignmentCount: 1, hasCounselorAssignment: false, supervisionCount: 0 })).toEqual([
      { label: "Partner Setup Incomplete", tone: "attention" },
      { label: "Awaiting Counselor Assignment", tone: "attention" },
    ]);
  });

  it("expresses team assignment and supervision conditions from live counts", () => {
    expect(groupOperationalStatuses({ type: "coaches", members: [activeMember, activeMember], activeAssignmentCount: 0, hasCounselorAssignment: false, supervisionCount: 0 })).toEqual([
      { label: "No Counselors Assigned", tone: "attention" },
      { label: "Available for Assignment", tone: "positive" },
    ]);
    expect(groupOperationalStatuses({ type: "counselors", members: [activeMember, activeMember], activeAssignmentCount: 0, hasCounselorAssignment: false, supervisionCount: 0 })).toEqual([
      { label: "No Coach Assigned", tone: "attention" },
      { label: "Available for Assignment", tone: "positive" },
    ]);
  });
});

describe("People detail record resolution", () => {
  it("keeps grouped and standalone record types distinct", () => {
    expect(groupRecordType("couple")).toBe("couples");
    expect(groupRecordType("coach_team")).toBe("coaches");
    expect(groupRecordType("counselor_team")).toBe("counselors");
    expect(standaloneProfileRecordType(["super_admin", "coach"])).toBe("admins");
    expect(standaloneProfileRecordType(["author"])).toBe("authors");
  });
});
