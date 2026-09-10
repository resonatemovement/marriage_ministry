import { isValidPhone, normalizePhone } from "@/features/onboarding/phone";

import {
  connections,
  type IntakeDraft,
  relationshipStatuses,
  referralSources,
  requestedSupportValues,
  type PersonDraft,
} from "./validation";

type RelationshipStatus = (typeof relationshipStatuses)[number];
type RequestedSupport = (typeof requestedSupportValues)[number];
type ReferralSource = (typeof referralSources)[number];
type Connection = (typeof connections)[number];

export type IntakeSubmissionPerson = {
  position: "requester" | "partner";
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string | null;
  connections: Connection[];
};

export type IntakeSubmissionPayload = {
  relationship_status: RelationshipStatus;
  wedding_date: string | null;
  campus_id: string | null;
  campus_other: string | null;
  currently_working_with_counselor: boolean;
  requested_support: RequestedSupport[];
  goals: string;
  questions: string | null;
  referral_source: ReferralSource;
  referral_source_other: string | null;
  people: [IntakeSubmissionPerson, IntakeSubmissionPerson];
};

type IntakeSubmissionValidation =
  | { value: IntakeSubmissionPayload }
  | { errors: Record<string, string> };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function includes<const Values extends readonly string[]>(values: Values, value: string): value is Values[number] {
  return (values as readonly string[]).includes(value);
}

function normalizePerson(person: PersonDraft, position: IntakeSubmissionPerson["position"]): IntakeSubmissionPerson {
  return {
    position,
    first_name: person.firstName.trim(),
    last_name: person.lastName.trim(),
    email: person.email.trim().toLowerCase(),
    phone: normalizePhone(person.phone),
    city: person.city.trim() || null,
    connections: person.connections.filter((value): value is Connection => includes(connections, value)),
  };
}

export function mapIntakeDraftToSubmissionPayload(draft: IntakeDraft): IntakeSubmissionPayload {
  return {
    relationship_status: draft.relationshipStatus as RelationshipStatus,
    wedding_date: draft.weddingDate.trim() || null,
    campus_id: draft.campusId.trim() || null,
    campus_other: draft.campusOther.trim() || null,
    currently_working_with_counselor: draft.workingWithCounselor === "yes",
    requested_support: draft.requestedSupport as RequestedSupport[],
    goals: draft.goals.trim(),
    questions: draft.questions.trim() || null,
    referral_source: draft.referralSource as ReferralSource,
    referral_source_other: draft.referralOther.trim() || null,
    people: [normalizePerson(draft.you, "requester"), normalizePerson(draft.partner, "partner")],
  };
}

export function validateIntakeSubmission(draft: IntakeDraft, activeCampusIds: readonly string[]): IntakeSubmissionValidation {
  const errors: Record<string, string> = {};
  const payload = mapIntakeDraftToSubmissionPayload(draft);

  for (const [key, person] of [["you", payload.people[0]], ["partner", payload.people[1]]] as const) {
    if (!person.first_name) errors[`${key}.firstName`] = "First name is required.";
    if (!person.last_name) errors[`${key}.lastName`] = "Last name is required.";
    if (!emailPattern.test(person.email)) errors[`${key}.email`] = "Enter a valid email address.";
    if (!isValidPhone(person.phone)) errors[`${key}.phone`] = "Enter a valid phone number.";
    if (!person.connections.length || person.connections.length !== draft[key].connections.length) errors[`${key}.connections`] = "Choose valid connection options.";
  }

  if (payload.people[0].email === payload.people[1].email) errors["partner.email"] = "Partner email must be different.";
  if (isValidPhone(payload.people[0].phone) && isValidPhone(payload.people[1].phone) && payload.people[0].phone === payload.people[1].phone) errors["partner.phone"] = "Partner phone number must be different.";
  if (!includes(relationshipStatuses, draft.relationshipStatus)) errors.relationshipStatus = "Choose a valid relationship status.";
  if (payload.wedding_date && !isValidDateOnly(payload.wedding_date)) errors.weddingDate = "Enter a valid wedding date.";

  const hasCampus = Boolean(payload.campus_id);
  const hasOtherCampus = Boolean(payload.campus_other);
  if (hasCampus === hasOtherCampus) errors.campus = "Choose an active campus or enter Other.";
  if (payload.campus_id && !activeCampusIds.includes(payload.campus_id)) errors.campus = "Choose an active campus.";
  if (payload.campus_other && payload.campus_other.length > 250) errors.campus = "Other campus is too long.";

  if (!["yes", "no"].includes(draft.workingWithCounselor)) errors.workingWithCounselor = "Choose yes or no.";
  if (!payload.requested_support.length || draft.requestedSupport.some((value) => !includes(requestedSupportValues, value)) || new Set(draft.requestedSupport).size !== draft.requestedSupport.length) errors.requestedSupport = "Choose valid support options.";
  if (!payload.goals) errors.goals = "Goals are required.";
  if (payload.goals.length > 10000) errors.goals = "Goals are too long.";
  if (payload.questions && payload.questions.length > 10000) errors.questions = "Questions are too long.";
  if (!includes(referralSources, draft.referralSource)) errors.referralSource = "Choose a valid referral source.";
  if ((payload.referral_source === "other") !== Boolean(payload.referral_source_other)) errors.referralOther = "Tell us how you found us.";
  if (payload.referral_source_other && payload.referral_source_other.length > 500) errors.referralOther = "Referral details are too long.";

  return Object.keys(errors).length ? { errors } : { value: payload };
}

export function toCreateIntakeRequestRpcArgs(payload: IntakeSubmissionPayload) {
  return { payload };
}

export function publicSubmissionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("active campus")) return "Please choose an active campus or select Other.";
  if (message.includes("different email")) return "Please use different email addresses for each person.";
  if (message.includes("Invalid") || message.includes("required")) return "Please review the information in your request and try again.";
  return "We could not submit your request right now. Please try again later.";
}
