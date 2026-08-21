"use client";

import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter your email address and password.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Unable to sign in with those credentials.");
      setIsSubmitting(false);
      return;
    }

    const entry = next ? `/auth/entry?next=${encodeURIComponent(next)}` : "/auth/entry";
    router.replace(entry);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="text-sm font-medium text-text-primary">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 h-11 w-full rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20"
          required
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="password" className="text-sm font-medium text-text-primary">Password</label>
          <a href="/forgot-password" className="text-sm font-medium text-brand-primary hover:underline">Forgot password?</a>
        </div>
        <div className="relative mt-2">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-md border border-border bg-white px-3 pr-11 text-sm text-text-primary outline-none transition placeholder:text-text-muted focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-text-muted transition hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand-primary"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong">{error}</p> : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-11 w-full rounded-md bg-brand-primary px-4 text-sm font-bold text-white transition hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary disabled:opacity-70"
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
