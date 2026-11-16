import { passwordError } from "./password-validation";

export const PASSWORD_RESET_CONFIRMATION =
  "If an account exists with that email address, you'll receive a link to reset your password. Please check your inbox.";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeResetEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidResetEmail(value: string) {
  const email = normalizeResetEmail(value);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function passwordResetRedirect(appUrl: string | undefined) {
  if (!appUrl) throw new Error("Password reset origin is not configured.");

  const configured = new URL(appUrl);
  const isLocalhost = ["localhost", "127.0.0.1"].includes(configured.hostname);
  if (
    (configured.protocol !== "https:" && !(isLocalhost && configured.protocol === "http:")) ||
    configured.username ||
    configured.password
  ) {
    throw new Error("Password reset origin is invalid.");
  }

  return new URL("/auth/password-reset", configured.origin).toString();
}

export async function requestPasswordReset(
  value: string,
  appUrl: string | undefined,
  send: (email: string, redirectTo: string) => Promise<unknown>,
) {
  const email = normalizeResetEmail(value);
  if (!isValidResetEmail(email)) return { status: "invalid" as const };

  try {
    const redirectTo = passwordResetRedirect(appUrl);
    await send(email, redirectTo);
  } catch {
    // Keep Auth/provider/configuration failures indistinguishable from unknown accounts.
  }

  return { status: "confirmation" as const };
}

export function recoveryTokenIsUsable(tokenHash: string | null, type: string | null) {
  return Boolean(tokenHash?.trim()) && type === "recovery";
}

type RecoveryAuth = {
  verifyOtp(input: { token_hash: string; type: "recovery" }): Promise<{ error: unknown | null }>;
};

export async function verifyPasswordRecovery(
  auth: RecoveryAuth,
  tokenHash: string | null,
  type: string | null,
) {
  if (!recoveryTokenIsUsable(tokenHash, type)) return false;

  try {
    const { error } = await auth.verifyOtp({ token_hash: tokenHash!, type: "recovery" });
    return !error;
  } catch {
    return false;
  }
}

type PasswordResetAuth = {
  updateUser(input: { password: string }): Promise<{ error: unknown | null }>;
  signOut(input: { scope: "local" }): Promise<{ error: unknown | null }>;
};

export async function saveResetPassword(
  auth: PasswordResetAuth,
  password: string,
  confirmation: string,
) {
  const validation = passwordError(password, confirmation);
  if (validation) return { status: "invalid" as const, message: validation };

  try {
    const { error } = await auth.updateUser({ password });
    if (error) return { status: "failed" as const };
  } catch {
    return { status: "failed" as const };
  }

  try {
    const { error: signOutError } = await auth.signOut({ scope: "local" });
    return signOutError
      ? { status: "updated-signout-failed" as const }
      : { status: "updated" as const };
  } catch {
    return { status: "updated-signout-failed" as const };
  }
}
