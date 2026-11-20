import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { canSubmitLogin } from "./login-validation";

describe("sign-in button validation", () => {
  it("requires a valid email and any nonempty existing password", () => {
    expect(canSubmitLogin("", "", false)).toBe(false);
    expect(canSubmitLogin("person@example.com", "", false)).toBe(false);
    expect(canSubmitLogin("", "current", false)).toBe(false);
    expect(canSubmitLogin("not-an-email", "current", false)).toBe(false);
    expect(canSubmitLogin(" person@example.com ", "x", false)).toBe(true);
  });

  it("disables again when either value is removed and while submitting", () => {
    expect(canSubmitLogin("person@example.com", "current", false)).toBe(true);
    expect(canSubmitLogin("", "current", false)).toBe(false);
    expect(canSubmitLogin("person@example.com", "", false)).toBe(false);
    expect(canSubmitLogin("person@example.com", "current", true)).toBe(false);
  });

  it("keeps controlled autofill-compatible fields and guards duplicate form submits", () => {
    const form = readFileSync(fileURLToPath(new URL("./login-form.tsx", import.meta.url)), "utf8");
    expect(form).toContain('autoComplete="email"');
    expect(form).toContain('autoComplete="current-password"');
    expect(form).toContain("emailInput.current?.value");
    expect(form).toContain("passwordInput.current?.value");
    expect(form).toContain("onChange={(event) => setEmail(event.target.value)}");
    expect(form).toContain("onChange={(event) => setPassword(event.target.value)}");
    expect(form).toContain("submissionInProgress.current");
    expect(form).toContain("disabled={!canSubmitLogin(email, password, isSubmitting)}");
    expect(form).toContain("signInWithPassword({ email, password })");
    expect(form).toContain("router.replace(entry)");
    expect(form).toContain("router.refresh()");
    expect(form).toContain('href="/forgot-password"');
    expect(form).toContain("showPassword ? \"text\" : \"password\"");
  });

  it("places the forgot-password link below the password input and right-aligns it", () => {
    const form = readFileSync(fileURLToPath(new URL("./login-form.tsx", import.meta.url)), "utf8");
    const passwordField = form.slice(form.indexOf('<label htmlFor="password"'), form.indexOf("{error ?"));

    expect(passwordField.indexOf('id="password"')).toBeLessThan(passwordField.indexOf('href="/forgot-password"'));
    expect(passwordField).toContain('<div className="mt-2 flex justify-end">');
    expect(form).toContain('<form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>');
    expect(form).not.toContain("items-center justify-between gap-4");
  });
});
