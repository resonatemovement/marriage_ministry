import type { CaseStatus } from "@/lib/counseling/domain";

import type { PeopleRecordType } from "./types";

export type MemberAccountStatus = "Active" | "Invitation Created" | "Invitation Sent" | "Delivery Failed" | "Deactivated";
export type InvitationLifecycleStatus = "Pending" | "Accepted" | "Expired" | "Revoked";
export type InvitationDeliveryStatus = "Not sent" | "Sent" | "Delivery Failed";

export interface PeopleDetailMember {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  accountStatus: MemberAccountStatus;
  onboardingStatus: string;
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
  status: "invited" | "active" | "deactivated";
}

export interface OperationalStatus {
  label: string;
  tone: "neutral" | "attention" | "positive";
}

export interface GroupPeopleDetail {
  kind: "group";
  id: string;
  type: Extract<PeopleRecordType, "couples" | "coaches" | "counselors">;
  name: string;
  campusId: string | null;
  campus: string | null;
  updatedAt: string;
  members: PeopleDetailMember[];
  counselingStatus: CaseStatus | null;
  activeAssignmentCount: number;
  assignmentSummary: string;
  supervisionSummary: string;
  operationalStatuses: OperationalStatus[];
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
  return null;
}

export function standaloneProfileRecordType(roles: readonly string[]): ProfilePeopleDetail["type"] | null {
  if (roles.includes("admin") || roles.includes("super_admin")) return "admins";
  return roles.includes("author") ? "authors" : null;
}

function memberState(status: "invited" | "active" | "deactivated") {
  if (status === "active") {
    return { accountStatus: "Active" as const, onboardingStatus: "Profile Ready" };
  }

  if (status === "invited") {
    return { accountStatus: "Invitation Sent" as const, onboardingStatus: "Profile Not Started" };
  }

  return { accountStatus: "Deactivated" as const, onboardingStatus: "Onboarding Incomplete" };
}

export function createDetailMember({ id, firstName, lastName, email, phone = null, photoUrl = null, roles, status }: DetailMemberInput): PeopleDetailMember {
  return {
    id,
    firstName: firstName ?? "",
    lastName: lastName ?? "",
    name: [firstName, lastName].filter(Boolean).join(" ") || email || "Resonate member",
    email,
    phone,
    roles,
    ...memberState(status),
    photoUrl,
  };
}

export function createPendingDetailMember(input: { id: string; firstName: string | null; lastName: string | null; email: string | null; delivered: boolean; failed: boolean }) : PeopleDetailMember {
  const deliveryStatus = input.failed ? "Delivery Failed" : input.delivered ? "Sent" : "Not sent";
  const accountStatus = deliveryStatus === "Delivery Failed" ? "Delivery Failed" : deliveryStatus === "Sent" ? "Invitation Sent" : "Invitation Created";
  return { id: input.id, invitationId: input.id, pending: true, firstName: input.firstName ?? "", lastName: input.lastName ?? "", name: [input.firstName, input.lastName].filter(Boolean).join(" ") || input.email || "Invitee", email: input.email, phone: null, roles: [], accountStatus, lifecycleStatus: "Pending", deliveryStatus, onboardingStatus: "Invitation Pending", photoUrl: null };
}

export function groupOperationalStatuses({
  type,
  members,
  activeAssignmentCount,
  hasCounselorAssignment,
  supervisionCount,
}: {
  type: GroupPeopleDetail["type"];
  members: readonly PeopleDetailMember[];
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
