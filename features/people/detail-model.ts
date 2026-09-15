import type { CaseStatus } from "@/lib/counseling/domain";

import type { PeopleRecordType } from "./types";
import { getOnboardingRequirements } from "@/features/onboarding/requirements";

export type MemberAccountStatus = "Active" | "Setup Incomplete" | "Invitation Created" | "Invitation Sent" | "Delivery Failed" | "Deactivated";
export type AccountAccessState = "pending_invitation" | "setup_incomplete" | "active_account" | "deactivated";
export type InvitationLifecycleStatus = "Pending" | "Accepted" | "Expired" | "Revoked";
export type InvitationDeliveryStatus = "Not sent" | "Sent" | "Delivery Failed";

export interface PeopleDetailMember {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  campusId?: string | null;
  photoPath?: string | null;
  roles: string[];
  accountStatus: MemberAccountStatus;
  accountAccessState: AccountAccessState;
  onboardingStatus: string;
  onboardingComplete: boolean;
  onboardingMissing?: string[];
  photoUrl: string | null;
  lifecycleStatus?: InvitationLifecycleStatus;
  deliveryStatus?: InvitationDeliveryStatus;
  invitationId?: string;
  pending?: boolean;
}

interface DetailMemberInput {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  roles: string[];
  status: "invited" | "password_required" | "onboarding" | "active" | "deactivated";
  onboardingCompletedAt?: string | null;
  campusId?: string | null;
  photoPath?: string | null;
  invitationId?: string;
}

export interface OperationalStatus {
  label: string;
  tone: "neutral" | "attention" | "positive";
}

export function operationalStatusLabel(statuses: readonly OperationalStatus[]): string {
  return statuses[0]?.label ?? "Active";
}

export interface GroupPeopleDetail {
  kind: "group";
  id: string;
  type: Extract<PeopleRecordType, "couples" | "coaches" | "counselors" | "campus_leads">;
  name: string;
  campusId: string | null;
  campus: string | null;
  updatedAt: string;
  members: PeopleDetailMember[];
  counselingStatus: CaseStatus | null;
  activeAssignmentCount: number;
  assignmentSummary: string;
  coachAssignment: string | null;
  counselorAssignment: string | null;
  campusLeadAssignment: string | null;
  supervisionSummary: string;
  operationalStatuses: OperationalStatus[];
  assignedCouples: AssignedCouple[];
  intakeOrigin?: { id: string; name: string | null; status: string; submittedAt: string | null } | null;
}

export interface AssignedCouple {
  id: string;
  name: string;
  campus: string | null;
  status: CaseStatus | null;
  assignedAt: string | null;
}

export interface ProfilePeopleDetail {
  kind: "profile";
  id: string;
  type: Extract<PeopleRecordType, "admins" | "authors">;
  name: string;
  campusId: string | null;
  campus: string | null;
  updatedAt: string;
  member: PeopleDetailMember;
}

export type PeopleDetail = GroupPeopleDetail | ProfilePeopleDetail;

export function groupRecordType(groupType: string | null): GroupPeopleDetail["type"] | null {
  if (groupType === "couple") return "couples";
  if (groupType === "coach_team") return "coaches";
  if (groupType === "counselor_team") return "counselors";
  if (groupType === "campus_lead_team") return "campus_leads";
  return null;
}

export function standaloneProfileRecordType(roles: readonly string[]): ProfilePeopleDetail["type"] | null {
  if (roles.includes("admin") || roles.includes("super_admin")) return "admins";
  return roles.includes("author") ? "authors" : null;
}

function memberState(status: DetailMemberInput["status"], onboardingCompletedAt: string | null | undefined, requirements: ReturnType<typeof getOnboardingRequirements>) {
  if (status === "active" || status === "onboarding") {
    return { accountStatus: "Active" as const, onboardingStatus: requirements.complete && onboardingCompletedAt ? "Onboarding Complete" : "Onboarding Incomplete", onboardingComplete: requirements.complete && Boolean(onboardingCompletedAt), onboardingMissing: requirements.missing };
  }

  if (status === "password_required") {
    return { accountStatus: "Setup Incomplete" as const, onboardingStatus: "Onboarding Not Started", onboardingComplete: false, onboardingMissing: requirements.missing };
  }

  if (status === "invited") {
    return { accountStatus: "Invitation Sent" as const, onboardingStatus: "Profile Not Started", onboardingComplete: false, onboardingMissing: requirements.missing };
  }

  return { accountStatus: "Deactivated" as const, onboardingStatus: "Onboarding Incomplete", onboardingComplete: false, onboardingMissing: requirements.missing };
}

export function accountAccessState(status: DetailMemberInput["status"]): AccountAccessState {
  if (status === "password_required") return "setup_incomplete";
  if (status === "deactivated") return "deactivated";
  return "active_account";
}

export function createDetailMember({ id, firstName, lastName, email, phone = null, photoUrl = null, roles, status, onboardingCompletedAt = null, campusId = null, photoPath = null, invitationId }: DetailMemberInput): PeopleDetailMember {
  const requirements = getOnboardingRequirements({ firstName, lastName, email, campusId, phone, photoPath });
  return {
    id,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    name: [firstName, lastName].filter(Boolean).join(" ") || email || "Resonate member",
    email,
    phone,
    campusId,
    photoPath,
    invitationId,
    roles,
    ...memberState(status, onboardingCompletedAt, requirements),
    accountAccessState: accountAccessState(status),
    photoUrl,
  };
}

export function createPendingDetailMember(input: { id: string; firstName: string | null; lastName: string | null; email: string | null; delivered: boolean; failed: boolean }) : PeopleDetailMember {
  const deliveryStatus = input.failed ? "Delivery Failed" : input.delivered ? "Sent" : "Not sent";
  const accountStatus = deliveryStatus === "Delivery Failed" ? "Delivery Failed" : deliveryStatus === "Sent" ? "Invitation Sent" : "Invitation Created";
  return { id: input.id, invitationId: input.id, pending: true, firstName: input.firstName ?? "", lastName: input.lastName ?? "", name: [input.firstName, input.lastName].filter(Boolean).join(" ") || input.email || "Invitee", email: input.email, phone: null, roles: [], accountStatus, accountAccessState: "pending_invitation", lifecycleStatus: "Pending", deliveryStatus, onboardingStatus: "Invitation Pending", onboardingComplete: false, onboardingMissing: ["first name", "last name", "email", "campus", "phone", "profile photo"], photoUrl: null };
}

export function groupOperationalStatuses({
  type,
  members,
  activeAssignmentCount,
  hasCounselorAssignment,
  supervisionCount,
}: {
  type: GroupPeopleDetail["type"];
  members: readonly Pick<PeopleDetailMember, "accountStatus" | "pending">[];
  activeAssignmentCount: number;
  hasCounselorAssignment: boolean;
  supervisionCount: number;
}): OperationalStatus[] {
  const statuses: OperationalStatus[] = [];

  const pending = members.filter((member) => member.pending).length;
  if (pending) {
    statuses.push({ label: pending === 2 ? "Invitations Pending" : "Waiting on Second Member", tone: "attention" });
  } else if (members.some((member) => member.accountStatus !== "Active")) {
    statuses.push({ label: type === "couples" ? "Partner Setup Incomplete" : "Member Setup Incomplete", tone: "attention" });
  }

  if (type === "couples" && !pending && !hasCounselorAssignment) {
    statuses.push({ label: "Awaiting Counselor Assignment", tone: "attention" });
  }

  if (type === "coaches" && supervisionCount === 0) {
    statuses.push({ label: "No Counselors Assigned", tone: "attention" });
  }

  if (type === "counselors" && supervisionCount === 0) {
    statuses.push({ label: "No Coach Assigned", tone: "attention" });
  }

  if (type !== "couples" && activeAssignmentCount === 0) {
    statuses.push({ label: "Available for Assignment", tone: "positive" });
  }

  return statuses;
}
