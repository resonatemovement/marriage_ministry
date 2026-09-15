import { isValidPhone, normalizePhone } from "@/features/onboarding/phone";

export type InvitationPerson = { firstName: string; lastName: string; email: string; phone?: string };
type InvitationFieldErrors = Record<string, string>;

const inviteRoles = ["admin", "super_admin", "campus_lead", "author", "coach", "counselor", "couple"];
const groupedRoles = ["campus_lead", "coach", "counselor", "couple"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isGroupedInvitationRole(role: string) { return groupedRoles.includes(role); }
export function isInvitationEmail(value: string) { return emailPattern.test(value.trim()); }

export function invitationPayloadFromForm(formData: FormData) {
  const role = String(formData.get("role") ?? "");
  const campusId = String(formData.get("campusId") ?? "").trim();
  const grouped = isGroupedInvitationRole(role);
  const invitees = Array.from({ length: grouped ? 2 : 1 }, (_, index) => ({
    first_name: String(formData.get(`firstName${index}`) ?? "").trim(),
    last_name: String(formData.get(`lastName${index}`) ?? "").trim(),
    email: String(formData.get(`email${index}`) ?? "").trim().toLowerCase(),
    phone: role === "couple" ? normalizePhone(String(formData.get(`phone${index}`) ?? "")) : "",
  }));
  return { role, campusId, invitees };
}

export function validateInvitation(role: string, campusId: string, people: InvitationPerson[]): InvitationFieldErrors {
  const errors: InvitationFieldErrors = {};
  if (!inviteRoles.includes(role)) errors.role = "Choose a valid invite type.";
  if (!campusId) errors.campus = "Choose an active Campus.";
  const requiredPeople = isGroupedInvitationRole(role) ? 2 : 1;
  for (let index = 0; index < requiredPeople; index += 1) {
    const person = people[index];
    if (!person?.firstName.trim()) errors[`firstName${index}`] = "First name is required.";
    if (!person?.lastName.trim()) errors[`lastName${index}`] = "Last name is required.";
    if (!isInvitationEmail(person?.email ?? "")) errors[`email${index}`] = "Enter a valid email address.";
    if (role === "couple" && !isValidPhone(person?.phone ?? "")) errors[`phone${index}`] = "Enter a valid phone number.";
  }
  if (requiredPeople === 2 && people[0]?.email.trim().toLowerCase() === people[1]?.email.trim().toLowerCase() && isInvitationEmail(people[0].email) && isInvitationEmail(people[1].email)) errors.email1 = "Email must be different from First Person.";
  return errors;
}
