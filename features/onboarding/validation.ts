type OnboardingFields = {
  firstName: string;
  lastName: string;
  phone: string;
};

type OnboardingErrors = Partial<Record<keyof OnboardingFields, string>>;

import { isValidPhone } from "./phone";

export function validateOnboarding(fields: OnboardingFields): OnboardingErrors {
  const errors: OnboardingErrors = {};
  const phone = fields.phone.trim();

  if (!fields.firstName.trim()) errors.firstName = "First name is required.";
  if (!fields.lastName.trim()) errors.lastName = "Last name is required.";
  if (!phone) errors.phone = "Phone number is required.";
  else if (!isValidPhone(phone)) errors.phone = "Enter a valid phone number.";

  return errors;
}
