import { describe, expect, it, vi } from "vitest";

import {
  PASSWORD_RESET_CONFIRMATION,
  isValidResetEmail,
  normalizeResetEmail,
  passwordResetRedirect,
  requestPasswordReset,
  recoveryTokenIsUsable,
  saveResetPassword,
  verifyPasswordRecovery,
} from "./password-reset";

describe("forgot password request", () => {
  it("normalizes and validates email without accepting malformed values", () => {
    expect(normalizeResetEmail("  USER@Example.COM ")).toBe("user@example.com");
    expect(isValidResetEmail("user@example.com")).toBe(true);
    expect(isValidResetEmail("user@localhost")).toBe(false);
    expect(isValidResetEmail("bad address@example.com")).toBe(false);
    expect(isValidResetEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });

  it("uses only the configured app origin and a fixed recovery route", () => {
    expect(passwordResetRedirect("https://marriage-ministry-dev.vercel.app/nested/path"))
      .toBe("https://marriage-ministry-dev.vercel.app/auth/password-reset");
    expect(passwordResetRedirect("http://localhost:3000/login")).toBe("http://localhost:3000/auth/password-reset");
    expect(() => passwordResetRedirect("http://app.example")).toThrow();
    expect(() => passwordResetRedirect("https://user:password@app.example")).toThrow();
    expect(() => passwordResetRedirect(undefined)).toThrow();
  });

  it("sends normalized valid addresses and always returns generic confirmation after a valid request", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const result = await requestPasswordReset(" USER@example.com ", "https://app.example", send);
    expect(send).toHaveBeenCalledWith("user@example.com", "https://app.example/auth/password-reset");
    expect(result).toEqual({ status: "confirmation" });
    expect(PASSWORD_RESET_CONFIRMATION).toBe("If an account exists with that email address, you'll receive a link to reset your password. Please check your inbox.");
  });

  it("does not reveal provider, configuration, or account-existence failures", async () => {
    const failedSend = vi.fn().mockRejectedValue(new Error("sensitive Auth detail"));
    const providerFailure = await requestPasswordReset("person@example.com", "https://app.example", failedSend);
    const configurationFailure = await requestPasswordReset("person@example.com", undefined, failedSend);
    expect(providerFailure).toEqual({ status: "confirmation" });
    expect(configurationFailure).toEqual({ status: "confirmation" });
    expect(JSON.stringify([providerFailure, configurationFailure])).not.toContain("sensitive Auth detail");
  });

  it("does not make an Auth request for invalid email", async () => {
    const send = vi.fn();
    expect(await requestPasswordReset("invalid", "https://app.example", send)).toEqual({ status: "invalid" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("recovery token validation and password update", () => {
  it("requires a recovery token hash and recovery type", () => {
    expect(recoveryTokenIsUsable("opaque-token", "recovery")).toBe(true);
    expect(recoveryTokenIsUsable(null, "recovery")).toBe(false);
    expect(recoveryTokenIsUsable("opaque-token", "signup")).toBe(false);
  });

  it("verifies only the supplied recovery token and rejects invalid or expired tokens", async () => {
    const auth = { verifyOtp: vi.fn().mockResolvedValue({ error: null }) };
    expect(await verifyPasswordRecovery(auth, null, "recovery")).toBe(false);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(await verifyPasswordRecovery(auth, "opaque-token", "signup")).toBe(false);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(await verifyPasswordRecovery(auth, "opaque-token", "recovery")).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({ token_hash: "opaque-token", type: "recovery" });
    auth.verifyOtp.mockResolvedValueOnce({ error: new Error("expired") });
    expect(await verifyPasswordRecovery(auth, "expired-token", "recovery")).toBe(false);
  });

  it.each(["invalid", "expired", "already used"])("fails closed when Supabase rejects an %s recovery link", async (reason) => {
    const auth = { verifyOtp: vi.fn().mockResolvedValue({ error: new Error(reason) }) };
    expect(await verifyPasswordRecovery(auth, "unusable-token", "recovery")).toBe(false);
  });

  it("rejects weak and mismatched passwords before updating Auth", async () => {
    const auth = { updateUser: vi.fn(), signOut: vi.fn() };
    expect(await saveResetPassword(auth, "short", "short")).toEqual({ status: "invalid", message: "Use at least 12 characters." });
    expect(await saveResetPassword(auth, "long-enough-password", "not-the-same-password")).toEqual({ status: "invalid", message: "Passwords do not match." });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password then clears only the local recovery session", async () => {
    const auth = { updateUser: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn().mockResolvedValue({ error: null }) };
    expect(await saveResetPassword(auth, "long-enough-password", "long-enough-password")).toEqual({ status: "updated" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "long-enough-password" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps update failures generic and distinguishes sign-out failure after a successful update", async () => {
    const failedUpdate = { updateUser: vi.fn().mockResolvedValue({ error: new Error("private") }), signOut: vi.fn() };
    expect(await saveResetPassword(failedUpdate, "long-enough-password", "long-enough-password")).toEqual({ status: "failed" });
    expect(failedUpdate.signOut).not.toHaveBeenCalled();

    const failedSignOut = { updateUser: vi.fn().mockResolvedValue({ error: null }), signOut: vi.fn().mockResolvedValue({ error: new Error("private") }) };
    expect(await saveResetPassword(failedSignOut, "long-enough-password", "long-enough-password")).toEqual({ status: "updated-signout-failed" });
  });
});
