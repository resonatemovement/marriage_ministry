import { describe, expect, it } from "vitest";

import { accountAccessState, createDetailMember, createPendingDetailMember, groupOperationalStatuses, groupRecordType, operationalStatusLabel, standaloneProfileRecordType } from "./detail-model";

const activeMember = createDetailMember({
  id: "active-member",
  firstName: "Active",
  lastName: "Member",
  email: "active@example.com",
  roles: ["coach"],
  status: "active",
});

describe("People detail member presentation", () => {
  it("carries persisted contact and photo data for completed members", () => {
    const member = createDetailMember({ id: "active", firstName: "Jordan", lastName: "Smith", email: "jordan@example.com", phone: "+15551234567", photoUrl: "https://signed.example/avatar.webp", roles: ["author"], status: "active", onboardingCompletedAt: "2026-01-01T00:00:00.000Z" });
    expect(member.phone).toBe("+15551234567");
    expect(member.photoUrl).toBe("https://signed.example/avatar.webp");
  });

  it("does not claim onboarding is complete without the persisted completion timestamp", () => {
    const member = createDetailMember({ id: "active", firstName: "Jordan", lastName: "Smith", email: "jordan@example.com", roles: ["couple"], status: "active" });
    expect(member.onboardingComplete).toBe(false);
    expect(member.onboardingStatus).toBe("Onboarding Incomplete");
  });

  it("keeps an active profile with a stale completion timestamp recoverable when its photo is missing", () => {
    const member = createDetailMember({
      id: "active-missing-photo",
      firstName: "Jordan",
      lastName: "Smith",
      email: "jordan@example.com",
      phone: "+15551234567",
      campusId: "campus",
      roles: ["couple"],
      status: "active",
      onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(member.onboardingComplete).toBe(false);
    expect(member.onboardingMissing).toEqual(["profile photo"]);
  });

  it("derives account access independently from onboarding completeness", () => {
    expect(accountAccessState("password_required")).toBe("setup_incomplete");
    expect(accountAccessState("onboarding")).toBe("active_account");
    const setupIncomplete = createDetailMember({ id: "setup", firstName: "Jordan", lastName: "Smith", email: "jordan@example.com", phone: "+15551234567", campusId: "campus", roles: ["couple"], status: "password_required" });
    const activeOnboarding = createDetailMember({ id: "active", firstName: "Taylor", lastName: "Smith", email: "taylor@example.com", phone: "+15551234568", campusId: "campus", roles: ["couple"], status: "onboarding" });
    expect(setupIncomplete).toMatchObject({ accountAccessState: "setup_incomplete", onboardingComplete: false, onboardingStatus: "Onboarding Not Started" });
    expect(activeOnboarding).toMatchObject({ accountAccessState: "active_account", onboardingComplete: false, onboardingStatus: "Onboarding Incomplete" });
  });

  it("keeps Couple partners independently addressable by account state", () => {
    const active = createDetailMember({ id: "partner-one", firstName: "One", lastName: "Partner", email: "one@example.com", roles: ["couple"], status: "onboarding", invitationId: "invite-one" });
    const setup = createDetailMember({ id: "partner-two", firstName: "Two", lastName: "Partner", email: "two@example.com", roles: ["couple"], status: "password_required", invitationId: "invite-two" });
    expect(active.accountAccessState).toBe("active_account");
    expect(setup).toMatchObject({ accountAccessState: "setup_incomplete", invitationId: "invite-two" });
  });

  it("keeps missing contact and photo values neutral", () => {
    const member = createDetailMember({ id: "active", firstName: "Jordan", lastName: "Smith", email: "jordan@example.com", roles: ["author"], status: "active" });
    expect(member.phone).toBeNull();
    expect(member.photoUrl).toBeNull();
  });

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
  it("uses Active as the shared ready-state presentation label", () => {
    expect(operationalStatusLabel([])).toBe("Active");
  });
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

describe("Pending invitation lifecycle and delivery presentation", () => {
  it.each([
    [false, false, "Not sent", "Invitation Created", "No delivery attempt has completed yet."],
    [true, false, "Sent", "Invitation Sent", "The invitation is still pending."],
    [true, true, "Delivery Failed", "Delivery Failed", "The invitation is still pending. Email delivery could not be completed."],
  ])("maps pending delivery state without claiming success", (delivered, failed, deliveryStatus, accountStatus) => {
    const member = createPendingDetailMember({ id: "invite", firstName: "Pending", lastName: "Person", email: "pending@example.com", delivered, failed });
    expect(member.lifecycleStatus).toBe("Pending");
    expect(member.deliveryStatus).toBe(deliveryStatus);
    expect(member.accountStatus).toBe(accountStatus);
  });

  it("keeps resend available for failed pending delivery", () => {
    const member = createPendingDetailMember({ id: "invite", firstName: "Pending", lastName: "Person", email: "pending@example.com", delivered: true, failed: true });
    expect(member.pending).toBe(true);
    expect(member.invitationId).toBe("invite");
  });
});

describe("People detail record resolution", () => {
  it("keeps grouped and standalone record types distinct", () => {
    expect(groupRecordType("couple")).toBe("couples");
    expect(groupRecordType("coach_team")).toBe("coaches");
    expect(groupRecordType("counselor_team")).toBe("counselors");
    expect(groupRecordType("campus_lead_team")).toBe("campus_leads");
    expect(standaloneProfileRecordType(["super_admin", "coach"])).toBe("admins");
    expect(standaloneProfileRecordType(["author"])).toBe("authors");
    expect(standaloneProfileRecordType(["campus_lead"])).toBeNull();
    expect(standaloneProfileRecordType(["campus_lead", "author"])).toBe("authors");
    expect(standaloneProfileRecordType(["unrelated"])).toBeNull();
  });
});
