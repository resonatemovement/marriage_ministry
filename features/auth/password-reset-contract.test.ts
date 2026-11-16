import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(resolve(process.cwd(), path), "utf8");

describe("password reset UI and route contract", () => {
  it("renders the approved forgot-password copy, shared form, and safe return link", async () => {
    const [page, form] = await Promise.all([
      source("app/forgot-password/page.tsx"),
      source("features/auth/forgot-password-form.tsx"),
    ]);
    expect(page).toContain("Forgot your password?");
    expect(page).toContain("Enter your email address and we&apos;ll send you a link to reset your password.");
    expect(page).toContain("<ForgotPasswordForm />");
    expect(page).toContain('href="/login"');
    expect(form).toContain('type="email"');
    expect(form).toContain("<Input");
    expect(form).toContain('disabled={!valid || pending}');
    expect(form).toContain('aria-describedby={visibleError ? "reset-email-error" : undefined}');
    expect(form).toContain("Send Reset Link");
    expect(form).toContain("Please check your inbox.");
  });

  it("requires the recovery route to validate token_hash before rendering password inputs", async () => {
    const [route, page] = await Promise.all([
      source("app/auth/password-reset/page.tsx"),
      source("features/auth/password-reset-page.tsx"),
    ]);
    expect(route).toContain("token_hash?: string");
    expect(page).toContain("verifyPasswordRecovery(supabase.auth, tokenHash, type)");
    expect(page).toContain("!checking && validRecovery && !updated");
    expect(page).toContain("/forgot-password");
    expect(page).toContain("window.history.replaceState(null, \"\", \"/auth/password-reset\")");
    expect(page).toContain('aria-label={showPassword ? "Hide new password" : "Show new password"}');
    expect(page).toContain('aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"}');
    expect(page).toContain("disabled={pending || Boolean(validation)}");
    expect(page).toContain("Passwords do not match.");
    expect(page).not.toContain("tokenHash}");
    expect(page).not.toContain("console.");
  });

  it("keeps activation and onboarding actions out of the password-reset success path", async () => {
    const [page, reset] = await Promise.all([
      source("features/auth/password-reset-page.tsx"),
      source("features/auth/password-reset.ts"),
    ]);
    expect(page).toContain("saveResetPassword(createBrowserSupabaseClient().auth, password, confirmation)");
    expect(page).toContain("/login?passwordReset=success");
    expect(page).not.toContain("acceptInvitation");
    expect(page).not.toContain("enterOnboardingAfterPassword");
    expect(reset).toContain('auth.updateUser({ password })');
    expect(reset).toContain('auth.signOut({ scope: "local" })');
    expect(reset).not.toContain('rpc("enter_onboarding"');
  });

  it("shows a non-enumerating sign-in success message after reset", async () => {
    const [route, page] = await Promise.all([
      source("app/login/page.tsx"),
      source("features/auth/login-page.tsx"),
    ]);
    expect(route).toContain('params.passwordReset === "success"');
    expect(page).toContain("Your password has been updated. Sign in with your new password.");
  });
});
