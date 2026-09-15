import { isValidPhone } from "./phone";

export type OnboardingRequirement = "first name" | "last name" | "email" | "campus" | "phone" | "profile photo";

export interface OnboardingRequirementInput {
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  email: string | null | undefined;
  campusId: string | null | undefined;
  phone: string | null | undefined;
  photoPath: string | null | undefined;
}

export interface OnboardingRequirements {
  complete: boolean;
  missing: OnboardingRequirement[];
}

export function getOnboardingRequirements(input: OnboardingRequirementInput): OnboardingRequirements {
  const missing: OnboardingRequirement[] = [];
  if (!input.firstName?.trim()) missing.push("first name");
  if (!input.lastName?.trim()) missing.push("last name");
  if (!input.email?.trim()) missing.push("email");
  if (!input.campusId) missing.push("campus");
  if (!input.phone?.trim() || !isValidPhone(input.phone)) missing.push("phone");
  if (!input.photoPath) missing.push("profile photo");
  return { complete: missing.length === 0, missing };
}
