import Link from "next/link";

import { ResonateBrand } from "@/components/navigation/resonate-brand";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:p-10 lg:bg-sidebar">
        <div className="w-full max-w-md">
          <section className="rounded-lg border border-black/[0.04] bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04),0_12px_32px_rgba(43,45,42,0.06)] sm:p-8">
            <div className="mb-6"><ResonateBrand /></div>
            <h1 className="font-heading text-3xl font-bold text-text-primary">Forgot your password?</h1>
            <p className="mt-3 text-sm leading-6 text-text-muted">Enter your email address and we&apos;ll send you a link to reset your password.</p>
            <ForgotPasswordForm />
            <Link href="/login" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-brand-primary hover:underline focus-visible:bg-surface-muted">
              Back to Sign In
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
