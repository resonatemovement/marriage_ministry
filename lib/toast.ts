import { toast } from "sonner";

const SUCCESS_TOAST_DURATION = 4000;
const ERROR_TOAST_DURATION = 6000;

/** Display a user-facing confirmation after an operation has succeeded. */
export function showSuccessToast(message: string) {
  toast.success(message, { duration: SUCCESS_TOAST_DURATION });
}

/** Display a success confirmation with a keyboard-accessible Sonner action. */
export function showSuccessToastWithAction(message: string, description: string, actionLabel: string, onAction: () => void) {
  toast.success(message, {
    duration: SUCCESS_TOAST_DURATION + 2000,
    description,
    action: { label: actionLabel, onClick: onAction },
  });
}

/** Display a safe, actionable message for an operation-level failure. */
export function showErrorToast(message: string) {
  toast.error(message, { duration: ERROR_TOAST_DURATION });
}
