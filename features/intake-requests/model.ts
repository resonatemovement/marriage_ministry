export const INTAKE_REQUEST_STATUSES = ["ready_for_review", "under_review", "ready_to_invite", "invited", "closed"] as const;
export type IntakeRequestStatus = (typeof INTAKE_REQUEST_STATUSES)[number];

export const INTAKE_STATUS_LABEL: Readonly<Record<IntakeRequestStatus, string>> = {
  ready_for_review: "Ready for Review", under_review: "Under Review", ready_to_invite: "Ready to Invite", invited: "Invited", closed: "Closed",
};

export function isIntakeRequestStatus(value: string): value is IntakeRequestStatus { return INTAKE_REQUEST_STATUSES.includes(value as IntakeRequestStatus); }
export type IntakeRequestView = "open" | "added" | "all";
export function isIntakeRequestView(value: string): value is IntakeRequestView { return value === "open" || value === "added" || value === "all"; }
const FILTERABLE_INTAKE_STATUSES = ["ready_for_review", "under_review", "invited", "closed"] as const;
export function intakeStatusesForView(view: IntakeRequestView) {
  if (view === "open") return FILTERABLE_INTAKE_STATUSES.slice(0, 2);
  if (view === "added") return FILTERABLE_INTAKE_STATUSES.slice(2, 3);
  return FILTERABLE_INTAKE_STATUSES;
}
export function isIntakeStatusAvailableInView(status: string, view: IntakeRequestView) {
  return intakeStatusesForView(view).some((value) => value === status);
}
export function isIntakeStatusFilterVisible(view: IntakeRequestView) { return intakeStatusesForView(view).length > 1; }
export function intakeViewHref(view: IntakeRequestView, search?: string, status?: string) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (status && isIntakeStatusAvailableInView(status, view)) params.set("status", status);
  params.set("view", view);
  return `/intake-requests?${params}`;
}
export function belongsToIntakeRequestView(request: { status: IntakeRequestStatus; hasInvitedCouple: boolean }, view: IntakeRequestView) {
  if (view === "added") return request.status === "invited" || request.hasInvitedCouple;
  if (view === "open") return !request.hasInvitedCouple && (request.status === "ready_for_review" || request.status === "under_review");
  return true;
}
export function coupleDisplayName(people: readonly { personPosition: "requester" | "partner"; firstName: string; lastName: string }[]) {
  const name = (position: "requester" | "partner") => { const person = people.find((item) => item.personPosition === position); return person ? `${person.firstName} ${person.lastName}`.trim() : ""; };
  return [name("requester"), name("partner")].filter(Boolean).join(" & ") || "Couple request";
}

export const RELATIONSHIP_LABEL: Record<"pre_engaged" | "engaged" | "married", string> = { pre_engaged: "Pre-engaged", engaged: "Engaged", married: "Married" };
export const SUPPORT_LABEL: Record<string, string> = { lay_counselor: "Resonate Marriage Lay Counselor", professional_referral: "Professional therapist referral" };
export const REFERRAL_LABEL: Record<string, string> = { church_announcements: "Church announcements", mc: "Through MC", friend: "Referral from a friend", ministry_leader: "Referral from a ministry leader", website: "Website", social_media: "Social Media", other: "Other" };
export const CONNECTION_LABEL: Record<string, string> = { member: "Resonate Member", regular_attendee: "Regular Resonate Church Attendee (3+ times a month)", mc: "Attend Resonate MC (Missional Community Small Group)", occasionally: "Attend church occasionally", not_attend: "Do not attend Resonate Church" };

export function notProvided(value: string | null | undefined) { return value?.trim() || "Not provided"; }
export function yesNo(value: boolean) { return value ? "Yes" : "No"; }
export { isDeleteConfirmation } from "@/components/shared/destructive-confirmation";
export function isIntakeDeleteEligible(status: IntakeRequestStatus, invitedGroupId: string | null) { return status !== "invited" && invitedGroupId === null; }
export function intakeLabels(values: readonly string[], labels: Record<string, string>) { const resolved = values.flatMap((value) => labels[value] ? [labels[value]] : []); return resolved.length ? resolved.join(", ") : "Not provided"; }
export function formatIntakePhone(value: string | null | undefined) { const digits = (value ?? "").replace(/\D/g, ""); const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits; return national.length === 10 ? `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}` : "Not provided"; }
export function formatIntakeDate(value: string | null | undefined) { if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Not provided"; const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, day)); return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date) : "Not provided"; }
