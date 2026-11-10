import type { PartnerGender } from "./partner-order";

type IntakePersonGender = { email: string | null; gender: string | null };

/** Resolves only the authoritative Intake gender for a matching invitation address. */
export function intakeGenderForInvitation(email: string | null, people: readonly IntakePersonGender[]): PartnerGender | undefined {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return undefined;

  const match = people.find((person) => person.email?.trim().toLowerCase() === normalizedEmail);
  return match?.gender === "male" || match?.gender === "female" ? match.gender : undefined;
}
