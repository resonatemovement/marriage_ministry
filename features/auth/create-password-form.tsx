"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

import { enterOnboardingAfterPassword } from "./create-password-actions";
import { passwordError } from "./password-validation";

export function CreatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const validation = passwordError(password, confirmation);
    if (validation) return setError(validation);
    setPending(true);
    const { error: passwordUpdateError } = await createBrowserSupabaseClient().auth.updateUser({ password });
    if (passwordUpdateError) {
      setPending(false);
      return setError("We could not save your password. Please try again.");
    }
    const result = await enterOnboardingAfterPassword();
    setPending(false);
    if (!result.success) return setError(result.error);
    router.replace("/onboarding");
    router.refresh();
  }

  return <form onSubmit={submit} className="mt-6 grid gap-4">
    <label className="grid gap-1.5 text-sm font-medium text-text-primary">New password<input required autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 rounded-md border border-border bg-white px-3 text-sm outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20" /></label>
    <label className="grid gap-1.5 text-sm font-medium text-text-primary">Confirm password<input required autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 rounded-md border border-border bg-white px-3 text-sm outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20" /></label>
    {error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}
    <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Saving..." : "Create Password"}</button>
  </form>;
}
