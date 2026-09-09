export const INTAKE_REQUEST_STATUSES = ["ready_for_review", "under_review", "ready_to_invite", "invited", "closed"] as const;
export type IntakeRequestStatus = (typeof INTAKE_REQUEST_STATUSES)[number];

export const INTAKE_STATUS_LABEL: Readonly<Record<IntakeRequestStatus, string>> = {
  ready_for_review: "Ready for Review", under_review: "Under Review", ready_to_invite: "Ready to Invite", invited: "Invited", closed: "Closed",
};

const MANUAL_TRANSITIONS: Readonly<Record<IntakeRequestStatus, readonly IntakeRequestStatus[]>> = {
  ready_for_review: ["under_review", "closed"], under_review: ["ready_for_review", "ready_to_invite", "closed"], ready_to_invite: ["under_review", "closed"], invited: [], closed: ["under_review"],
};

export function isIntakeRequestStatus(value: string): value is IntakeRequestStatus { return INTAKE_REQUEST_STATUSES.includes(value as IntakeRequestStatus); }
export function manualNextIntakeStatuses(status: IntakeRequestStatus) { return MANUAL_TRANSITIONS[status]; }
export function canManuallyTransitionIntakeRequest(from: IntakeRequestStatus, to: IntakeRequestStatus) { return MANUAL_TRANSITIONS[from].includes(to); }
export function coupleDisplayName(people: readonly { personPosition: "requester" | "partner"; firstName: string; lastName: string }[]) {
  const name = (position: "requester" | "partner") => { const person = people.find((item) => item.personPosition === position); return person ? `${person.firstName} ${person.lastName}`.trim() : ""; };
  return [name("requester"), name("partner")].filter(Boolean).join(" & ") || "Couple request";
}

export const RELATIONSHIP_LABEL: Record<"pre_engaged" | "engaged" | "married", string> = { pre_engaged: "Pre-engaged", engaged: "Engaged", married: "Married" };
export const SUPPORT_LABEL: Record<string, string> = { lay_counselor: "Resonate Marriage Lay Counselor", professional_referral: "Professional therapist referral" };
export const REFERRAL_LABEL: Record<string, string> = { church_announcements: "Church announcements", mc: "Through MC", friend: "Referral from a friend", ministry_leader: "Referral from a ministry leader", website: "Website", social_media: "Social Media", other: "Other" };
