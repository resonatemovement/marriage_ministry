import { redirect } from "next/navigation";

import { CreatePasswordForm } from "@/features/auth/create-password-form";
import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { ResonateBrand } from "@/components/navigation/resonate-brand";

export default async function CreatePasswordPage() {
  const identity = await getAuthenticatedIdentity();
  if (!identity) redirect("/login");
  if (identity.accountStage === "onboarding") redirect("/onboarding");
  if (identity.accountStage === "active") redirect("/workspace");
  if (identity.accountStage !== "password_required") redirect("/login?error=activation");

  return (
    <main className="min-h-screen bg-background">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:p-10 lg:bg-sidebar">
        <div className="w-full max-w-md">
          <section className="rounded-lg border border-black/[0.04] bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04),0_12px_32px_rgba(43,45,42,0.06)] sm:p-8">
            <div className="mb-6"><ResonateBrand /></div>
            <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Profile setup</p>
            <h1 className="font-heading mt-2 text-3xl font-bold text-text-primary">Create your password</h1>
            <p className="mt-3 text-sm leading-6 text-text-muted">You&apos;re almost there. Create a password to finish setting up your Resonate Marriage Ministry account.</p>
            <CreatePasswordForm />
          </section>
        </div>
      </section>
    </main>
  );
}
