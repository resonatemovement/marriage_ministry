"use client";

import { useRef, useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";

import { sendPasswordReset } from "./password-reset-actions";
import { isValidResetEmail } from "./password-reset";

export function ForgotPasswordForm() {
  const submitting = useRef(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);
  const valid = isValidResetEmail(email);
  const visibleError = error || (touched && email && !valid ? "Enter a valid email address." : "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending || !valid) {
      if (!valid) setError("Enter a valid email address.");
      return;
    }

    setError("");
    submitting.current = true;
    setPending(true);
    let result: Awaited<ReturnType<typeof sendPasswordReset>>;
    try {
      result = await sendPasswordReset(email);
    } catch {
      // Network failures use the same confirmation copy to avoid account enumeration.
      setPending(false);
      submitting.current = false;
      setSubmitted(true);
      return;
    }
    setPending(false);
    submitting.current = false;
    if (result.status === "invalid") {
      setError("Enter a valid email address.");
      return;
    }
    setSubmitted(true);
  }

  return submitted ? (
    <div role="status" className="mt-6 rounded-md bg-success-soft px-4 py-3 text-sm leading-6 text-text-primary">
      If an account exists with that email address, you&apos;ll receive a link to reset your password. Please check your inbox.
    </div>
  ) : (
    <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
      <div>
        <label htmlFor="reset-email" className="text-sm font-medium text-text-primary">Email address</label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          aria-invalid={Boolean(visibleError)}
          aria-describedby={visibleError ? "reset-email-error" : undefined}
          onBlur={() => setTouched(true)}
          onChange={(event) => {
            setEmail(event.target.value);
            setError("");
          }}
          className="mt-2 h-11"
        />
        {visibleError ? <p id="reset-email-error" role="alert" className="mt-2 text-sm text-danger-strong">{visibleError}</p> : null}
      </div>
      <button
        type="submit"
        disabled={!valid || pending}
        className="h-11 w-full rounded-md bg-brand-primary px-4 text-sm font-bold text-white transition hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send Reset Link"}
      </button>
    </form>
  );
}
