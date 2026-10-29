import { isValidPhone, normalizePhone } from "@/features/onboarding/phone";
import { validateOnboarding } from "@/features/onboarding/validation";

export type PartnerDetailsFields = {
  firstName: string;
  lastName: string;
  phone: string;
  gender: "male" | "female" | "";
};

export type PartnerDetailsErrors = Partial<Record<keyof PartnerDetailsFields, string>>;

export function validatePartnerDetails(fields: PartnerDetailsFields): PartnerDetailsErrors {
  const errors: PartnerDetailsErrors = validateOnboarding(fields);
  if (fields.gender !== "male" && fields.gender !== "female") errors.gender = "Choose a gender.";
  return errors;
}

export function hasPartnerDetailsChanges(current: PartnerDetailsFields, original: PartnerDetailsFields) {
  return current.firstName.trim() !== original.firstName.trim()
    || current.lastName.trim() !== original.lastName.trim()
    || (isValidPhone(current.phone) ? normalizePhone(current.phone) : current.phone.trim())
      !== (isValidPhone(original.phone) ? normalizePhone(original.phone) : original.phone.trim())
    || current.gender !== original.gender;
}
