import { isValidPhone, normalizePhone } from "@/features/onboarding/phone";

export const connections = ["member", "regular_attendee", "mc", "occasionally", "not_attend"] as const;
export const relationshipStatuses = ["pre_engaged", "engaged", "married"] as const;
export const requestedSupportValues = ["lay_counselor", "professional_referral"] as const;
export const referralSources = ["church_announcements", "mc", "friend", "ministry_leader", "website", "social_media", "other"] as const;

export type PersonDraft = { firstName: string; lastName: string; phone: string; email: string; city: string; connections: string[] };
export type IntakeDraft = { you: PersonDraft; partner: PersonDraft; relationshipStatus: string; weddingDate: string; campusId: string; campusOther: string; workingWithCounselor: string; requestedSupport: string[]; goals: string; questions: string; referralSource: string; referralOther: string };

const emptyPerson = (): PersonDraft => ({ firstName: "", lastName: "", phone: "", email: "", city: "", connections: [] });
export const emptyDraft = (): IntakeDraft => ({ you: emptyPerson(), partner: emptyPerson(), relationshipStatus: "", weddingDate: "", campusId: "", campusOther: "", workingWithCounselor: "", requestedSupport: [], goals: "", questions: "", referralSource: "", referralOther: "" });
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateStep(step: number, draft: IntakeDraft) {
  const errors: Record<string, string> = {};
  if (step === 1) {
    for (const [key, person] of [["you", draft.you], ["partner", draft.partner]] as const) {
      if (!person.firstName.trim()) errors[`${key}.firstName`] = "First name is required.";
      if (!person.lastName.trim()) errors[`${key}.lastName`] = "Last name is required.";
      if (!isValidPhone(person.phone)) errors[`${key}.phone`] = "Enter a valid phone number.";
      if (!email.test(person.email.trim())) errors[`${key}.email`] = "Enter a valid email address.";
    }
    if (draft.you.email.trim().toLowerCase() === draft.partner.email.trim().toLowerCase()) errors["partner.email"] = "Partner email must be different.";
    if (isValidPhone(draft.you.phone) && isValidPhone(draft.partner.phone) && normalizePhone(draft.you.phone) === normalizePhone(draft.partner.phone)) errors["partner.phone"] = "Partner phone number must be different.";
  }
  if (step === 2 && !relationshipStatuses.includes(draft.relationshipStatus as never)) errors.relationshipStatus = "Choose a relationship status.";
  if (step === 3) {
    if (!draft.you.connections.length) errors["you.connections"] = "Choose at least one connection.";
    if (!draft.partner.connections.length) errors["partner.connections"] = "Choose at least one connection.";
    if (!draft.campusId && !draft.campusOther.trim()) errors.campus = "Choose a campus or enter Other.";
  }
  if (step === 4) {
    if (!["yes", "no"].includes(draft.workingWithCounselor)) errors.workingWithCounselor = "Choose yes or no.";
    if (!draft.requestedSupport.length || draft.requestedSupport.some((value) => !requestedSupportValues.includes(value as never))) errors.requestedSupport = "Choose at least one option.";
    if (!draft.goals.trim()) errors.goals = "Goals are required.";
    if (!referralSources.includes(draft.referralSource as never)) errors.referralSource = "Choose how you found us.";
    if (draft.referralSource === "other" && !draft.referralOther.trim()) errors.referralOther = "Please tell us how you found us.";
  }
  return errors;
}

export function revalidateVisibleErrors(step: number, draft: IntakeDraft, visibleErrors: Record<string, string>) {
  const currentErrors = validateStep(step, draft);
  return Object.fromEntries(Object.keys(visibleErrors).flatMap((key) => currentErrors[key] ? [[key, currentErrors[key]]] : []));
}

export function normalizeDraft(draft: IntakeDraft): IntakeDraft {
  return { ...draft, you: { ...draft.you, firstName: draft.you.firstName.trim(), lastName: draft.you.lastName.trim(), email: draft.you.email.trim().toLowerCase(), phone: normalizePhone(draft.you.phone) }, partner: { ...draft.partner, firstName: draft.partner.firstName.trim(), lastName: draft.partner.lastName.trim(), email: draft.partner.email.trim().toLowerCase(), phone: normalizePhone(draft.partner.phone) }, goals: draft.goals.trim(), questions: draft.questions.trim(), campusOther: draft.campusOther.trim(), referralOther: draft.referralOther.trim() };
}

export function capitalizeInitials(value: string) {
  return value.replace(/(^|[\s\-'])\p{L}/gu, (match) => match.slice(0, -1) + match.at(-1)!.toUpperCase());
}
