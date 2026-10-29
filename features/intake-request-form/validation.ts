import { isValidPhone, normalizePhone } from "@/features/onboarding/phone";

export const connections = ["member", "regular_attendee", "mc", "occasionally", "not_attend"] as const;
export const relationshipStatuses = ["pre_engaged", "engaged", "married"] as const;
export const requestedSupportValues = ["lay_counselor", "professional_referral"] as const;
export const referralSources = ["church_announcements", "mc", "friend", "ministry_leader", "website", "social_media", "other"] as const;

export type IntakeGender = "male" | "female";
export type PersonDraft = { firstName: string; lastName: string; gender: IntakeGender | ""; phone: string; email: string; city: string; connections: string[] };
export type IntakeDraft = { you: PersonDraft; partner: PersonDraft; relationshipStatus: string; weddingDate: string; campusId: string; campusOther: string; workingWithCounselor: string; requestedSupport: string[]; goals: string; questions: string; referralSource: string; referralOther: string };

const emptyPerson = (): PersonDraft => ({ firstName: "", lastName: "", gender: "", phone: "", email: "", city: "", connections: [] });
export const emptyDraft = (): IntakeDraft => ({ you: emptyPerson(), partner: emptyPerson(), relationshipStatus: "", weddingDate: "", campusId: "", campusOther: "", workingWithCounselor: "", requestedSupport: [], goals: "", questions: "", referralSource: "", referralOther: "" });
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateOnly(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function validateStep(step: number, draft: IntakeDraft, activeCampusIds?: readonly string[]) {
  const errors: Record<string, string> = {};
  if (step === 1) {
    for (const [key, person] of [["you", draft.you], ["partner", draft.partner]] as const) {
      if (!person.firstName.trim()) errors[`${key}.firstName`] = "First name is required.";
      if (!person.lastName.trim()) errors[`${key}.lastName`] = "Last name is required.";
      if (person.gender !== "male" && person.gender !== "female") errors[`${key}.gender`] = "Choose a gender.";
      if (!isValidPhone(person.phone)) errors[`${key}.phone`] = "Enter a valid phone number.";
      if (!email.test(person.email.trim())) errors[`${key}.email`] = "Enter a valid email address.";
    }
    const youEmail = draft.you.email.trim().toLowerCase();
    const partnerEmail = draft.partner.email.trim().toLowerCase();
    if (email.test(youEmail) && email.test(partnerEmail) && youEmail === partnerEmail) errors["partner.email"] = "Partner email must be different.";
    if (isValidPhone(draft.you.phone) && isValidPhone(draft.partner.phone) && normalizePhone(draft.you.phone) === normalizePhone(draft.partner.phone)) errors["partner.phone"] = "Partner phone number must be different.";
  }
  if (step === 2) {
    if (!relationshipStatuses.includes(draft.relationshipStatus as never)) errors.relationshipStatus = "Choose a relationship status.";
    if (draft.weddingDate.trim() && !isValidDateOnly(draft.weddingDate.trim())) errors.weddingDate = "Enter a valid wedding date.";
  }
  if (step === 3) {
    for (const [key, person] of [["you", draft.you], ["partner", draft.partner]] as const) {
      if (!person.connections.length || person.connections.some((value) => !connections.includes(value as never)) || new Set(person.connections).size !== person.connections.length) errors[`${key}.connections`] = "Choose at least one valid connection.";
    }
    const campusId = draft.campusId.trim();
    const campusOther = draft.campusOther.trim();
    if (Boolean(campusId) === Boolean(campusOther)) errors.campus = "Choose an active campus or enter Other, not both.";
    if (campusId && activeCampusIds && !activeCampusIds.includes(campusId)) errors.campus = "Choose an active campus.";
    if (campusOther.length > 250) errors.campus = "Other campus is too long.";
  }
  if (step === 4) {
    if (!["yes", "no"].includes(draft.workingWithCounselor)) errors.workingWithCounselor = "Choose yes or no.";
    if (!draft.requestedSupport.length || draft.requestedSupport.some((value) => !requestedSupportValues.includes(value as never)) || new Set(draft.requestedSupport).size !== draft.requestedSupport.length) errors.requestedSupport = "Choose at least one valid support option.";
    if (!draft.goals.trim()) errors.goals = "Goals are required.";
    if (draft.goals.trim().length > 10000) errors.goals = "Goals are too long.";
    if (draft.questions.trim().length > 10000) errors.questions = "Questions are too long.";
    if (!referralSources.includes(draft.referralSource as never)) errors.referralSource = "Choose how you found us.";
    if (draft.referralSource === "other" && !draft.referralOther.trim()) errors.referralOther = "Please tell us how you found us.";
    if (draft.referralSource !== "other" && draft.referralOther.trim()) errors.referralOther = "Referral details are only used when you choose Other.";
    if (draft.referralOther.trim().length > 500) errors.referralOther = "Referral details are too long.";
  }
  return errors;
}

export function canAdvanceIntakeStep(step: number, draft: IntakeDraft, activeCampusIds: readonly string[]) {
  return step >= 1 && step < 5 && Object.keys(validateStep(step, draft, activeCampusIds)).length === 0;
}

export function getVisibleStepErrors(
  step: number,
  draft: IntakeDraft,
  touchedFields: Readonly<Record<string, boolean>>,
  activeCampusIds: readonly string[],
): Record<string, string> {
  const errors = validateStep(step, draft, activeCampusIds);
  return Object.fromEntries(
    Object.entries(errors).filter(([field, message]) => {
      if (field === "partner.email" && message.includes("different")) {
        return touchedFields["you.email"] && touchedFields["partner.email"];
      }
      if (field === "partner.phone" && message.includes("different")) {
        return touchedFields["you.phone"] && touchedFields["partner.phone"];
      }
      return touchedFields[field];
    }),
  ) as Record<string, string>;
}

export function getVisibleSubmissionErrors(
  draft: IntakeDraft,
  touchedFields: Readonly<Record<string, boolean>>,
  activeCampusIds: readonly string[],
): Record<string, string> {
  return Object.assign({}, ...[1, 2, 3, 4].map((step) =>
    getVisibleStepErrors(step, draft, touchedFields, activeCampusIds),
  ));
}

export function normalizeDraft(draft: IntakeDraft): IntakeDraft {
  return { ...draft, you: { ...draft.you, firstName: draft.you.firstName.trim(), lastName: draft.you.lastName.trim(), email: draft.you.email.trim().toLowerCase(), phone: normalizePhone(draft.you.phone) }, partner: { ...draft.partner, firstName: draft.partner.firstName.trim(), lastName: draft.partner.lastName.trim(), email: draft.partner.email.trim().toLowerCase(), phone: normalizePhone(draft.partner.phone) }, goals: draft.goals.trim(), questions: draft.questions.trim(), campusOther: draft.campusOther.trim(), referralOther: draft.referralOther.trim() };
}

export function capitalizeInitials(value: string) {
  return value.replace(/(^|[\s\-'])\p{L}/gu, (match) => match.slice(0, -1) + match.at(-1)!.toUpperCase());
}
