import { isValidEmail } from "./email-validation";

export function canSubmitLogin(email: string, password: string, isSubmitting: boolean) {
  return !isSubmitting && isValidEmail(email) && password.length > 0;
}
