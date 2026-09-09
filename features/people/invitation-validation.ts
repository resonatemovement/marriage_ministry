export type InvitationPerson = { firstName: string; lastName: string; email: string };
type InvitationFieldErrors = Record<string, string>;

const inviteRoles = ["admin", "super_admin", "author", "couple", "coach", "counselor"];
const groupedRoles = ["couple", "coach", "counselor"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isGroupedInvitationRole(role: string) { return groupedRoles.includes(role); }
export function isInvitationEmail(value: string) { return emailPattern.test(value.trim()); }

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
  }
  if (requiredPeople === 2 && people[0]?.email.trim().toLowerCase() === people[1]?.email.trim().toLowerCase() && isInvitationEmail(people[0].email) && isInvitationEmail(people[1].email)) errors.email1 = "Email must be different from First Person.";
  return errors;
}
