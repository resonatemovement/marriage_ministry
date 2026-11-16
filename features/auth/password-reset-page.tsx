"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { ResonateBrand } from "@/components/navigation/resonate-brand";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

import { saveResetPassword, verifyPasswordRecovery } from "./password-reset";
import { passwordError } from "./password-validation";

export function PasswordResetPage({ tokenHash, type }: { tokenHash: string | null; type: string | null }) {
  const router = useRouter();
  const verificationStarted = useRef(false);
  const submitting = useRef(false);
  const [validRecovery, setValidRecovery] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pending, setPending] = useState(false);
  const [updated, setUpdated] = useState(false);
  const validation = passwordError(password, confirmation);
  const visibleValidation = password.length > 0 && password.length < 12
    ? "Use at least 12 characters."
    : confirmation.length > 0 && password !== confirmation
      ? "Passwords do not match."
      : "";

  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;

    async function verify() {
      try {
        const supabase = createBrowserSupabaseClient();
        const verified = await verifyPasswordRecovery(supabase.auth, tokenHash, type);
        setValidRecovery(verified);
      } catch {
        setValidRecovery(false);
      } finally {
        setChecking(false);
        if (tokenHash || window.location.search) {
          window.history.replaceState(null, "", "/auth/password-reset");
        }
      }
    }

    void verify();
  }, [tokenHash, type]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !validRecovery || pending) return;
    submitting.current = true;
    setError("");
    setPending(true);
    let result: Awaited<ReturnType<typeof saveResetPassword>>;
    try {
      result = await saveResetPassword(createBrowserSupabaseClient().auth, password, confirmation);
    } catch {
      result = { status: "failed" };
    }
    setPending(false);
    submitting.current = false;

    if (result.status === "invalid") {
      setError(result.message);
      return;
    }
    if (result.status === "failed") {
      setError("We could not update your password. Please try again.");
      return;
    }

    if (result.status === "updated-signout-failed") {
      setUpdated(true);
      setError("Your password was updated, but we could not end this recovery session. Please try again before signing in.");
      return;
    }

    router.replace("/login?passwordReset=success");
    router.refresh();
  }

  async function finishSignOut() {
    setPending(true);
    let signOutError: unknown;
    try {
      ({ error: signOutError } = await createBrowserSupabaseClient().auth.signOut({ scope: "local" }));
    } catch {
      signOutError = true;
    }
    setPending(false);
    if (signOutError) {
      setError("We could not end this recovery session. Please try again.");
      return;
    }
    router.replace("/login?passwordReset=success");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-background">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:p-10 lg:bg-sidebar">
        <div className="w-full max-w-md">
          <section className="rounded-lg border border-black/[0.04] bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04),0_12px_32px_rgba(43,45,42,0.06)] sm:p-8">
            <div className="mb-6"><ResonateBrand /></div>
            <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Password reset</p>
            <h1 className="font-heading mt-2 text-3xl font-bold text-text-primary">Set a new password</h1>
            {checking ? <p role="status" className="mt-3 text-sm leading-6 text-text-muted">Checking your secure reset link…</p> : null}
            {!checking && !validRecovery ? (
              <>
                <p className="mt-3 text-sm leading-6 text-text-muted">This password reset link is invalid, expired, or has already been used. Request a new link to continue.</p>
                <a href="/forgot-password" className="mt-6 inline-flex min-h-11 items-center rounded-md bg-brand-primary px-4 text-sm font-bold text-white hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Request a new link</a>
              </>
            ) : null}
            {!checking && validRecovery && updated ? (
              <div className="mt-4">
                <p role="status" className="text-sm leading-6 text-success-strong">Your password has been updated. End this recovery session to return to Sign In.</p>
                {error ? <p role="alert" className="mt-3 text-sm leading-6 text-danger-strong">{error}</p> : null}
                <button type="button" onClick={finishSignOut} disabled={pending} className="mt-5 min-h-11 w-full rounded-md bg-brand-primary px-4 text-sm font-bold text-white hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:opacity-60">{pending ? "Signing out…" : "Continue to Sign In"}</button>
              </div>
            ) : null}
            {!checking && validRecovery && !updated ? (
              <>
                <p className="mt-3 text-sm leading-6 text-text-muted">Choose a new password for your Resonate account.</p>
                <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
                  <p className="text-sm text-text-muted">Use at least 12 characters and enter the same password in both fields.</p>
                  <div>
                    <label htmlFor="new-password" className="text-sm font-medium text-text-primary">New password</label>
                    <div className="relative mt-1.5">
                      <Input id="new-password" name="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required value={password} aria-invalid={Boolean(password && password.length < 12)} aria-describedby="password-requirements" onChange={(event) => setPassword(event.target.value)} className="min-h-11 pr-11" />
                      <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide new password" : "Show new password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-text-muted hover:text-brand-primary focus-visible:bg-surface-muted">{showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="confirm-password" className="text-sm font-medium text-text-primary">Confirm password</label>
                    <div className="relative mt-1.5">
                      <Input id="confirm-password" name="confirm-password" type={showConfirmation ? "text" : "password"} autoComplete="new-password" required value={confirmation} aria-invalid={Boolean(confirmation && password !== confirmation)} aria-describedby={confirmation && password !== confirmation ? "password-mismatch" : undefined} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 pr-11" />
                      <button type="button" onClick={() => setShowConfirmation((visible) => !visible)} aria-label={showConfirmation ? "Hide confirmation password" : "Show confirmation password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-text-muted hover:text-brand-primary focus-visible:bg-surface-muted">{showConfirmation ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button>
                    </div>
                  </div>
                  <p id="password-requirements" className="sr-only">Use at least 12 characters.</p>
                  {visibleValidation ? <p id={visibleValidation === "Passwords do not match." ? "password-mismatch" : undefined} role="status" className="text-sm text-text-muted">{visibleValidation}</p> : null}
                  {error ? <p role="alert" className="text-sm leading-6 text-danger-strong">{error}</p> : null}
                  <button type="submit" disabled={pending || Boolean(validation)} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-bold text-white hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving…" : "Update Password"}</button>
                </form>
              </>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
