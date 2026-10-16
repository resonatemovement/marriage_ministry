import { toast } from "sonner";

const SUCCESS_TOAST_DURATION = 4000;
const ERROR_TOAST_DURATION = 6000;

/** Display a user-facing confirmation after an operation has succeeded. */
export function showSuccessToast(message: string) {
  toast.success(message, { duration: SUCCESS_TOAST_DURATION });
}

/** Display a safe, actionable message for an operation-level failure. */
export function showErrorToast(message: string) {
  toast.error(message, { duration: ERROR_TOAST_DURATION });
}
