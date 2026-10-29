import { normalizePhone } from "@/features/onboarding/phone";

import {
  connections,
  type IntakeDraft,
  relationshipStatuses,
  referralSources,
  requestedSupportValues,
  validateStep,
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
  gender: "male" | "female";
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

function includes<const Values extends readonly string[]>(values: Values, value: string): value is Values[number] {
  return (values as readonly string[]).includes(value);
}

function normalizePerson(person: PersonDraft, position: IntakeSubmissionPerson["position"]): IntakeSubmissionPerson {
  return {
    position,
    first_name: person.firstName.trim(),
    last_name: person.lastName.trim(),
    gender: person.gender as "male" | "female",
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
  const errors: Record<string, string> = Object.assign({}, ...[1, 2, 3, 4].map((step) => validateStep(step, draft, activeCampusIds)));
  const payload = mapIntakeDraftToSubmissionPayload(draft);

  return Object.keys(errors).length ? { errors } : { value: payload };
}

export function canSubmitIntake(draft: IntakeDraft, activeCampusIds: readonly string[]) {
  return !('errors' in validateIntakeSubmission(draft, activeCampusIds));
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
