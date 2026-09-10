import { redirect } from "next/navigation";

import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { getAuthenticatedIdentity } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const identity = await getAuthenticatedIdentity();

  if (!identity) redirect("/login");
  if (identity.accountStage === "password_required") redirect("/auth/create-password");
  if (identity.accountStage !== "onboarding") redirect("/workspace");

  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");
  const { data: rawProfile } = await supabase
    .from("profiles")
    .select("id,first_name,last_name,email,phone,photo_path,campus:campuses(name)")
    .eq("id", userId)
    .maybeSingle();
  const profile = rawProfile as unknown as {
    id: string; first_name: string; last_name: string; email: string | null; phone: string | null; photo_path: string | null; campus: { name: string } | null;
  } | null;
  if (!profile?.email) redirect("/login?error=access");
  const photoUrl = profile.photo_path ? (await supabase.storage.from("profile-photos").createSignedUrl(profile.photo_path, 3600)).data?.signedUrl ?? null : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-5 sm:p-8">
      <section className="w-full rounded-lg border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04)] sm:p-8">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Profile setup</p>
        <h1 className="font-heading mt-2 text-3xl font-bold text-text-primary">Complete your details</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">Save your profile details now. A profile photo will be required before workspace access is available.</p>
        <OnboardingForm profileId={profile.id} firstName={profile.first_name} lastName={profile.last_name} phone={profile.phone ?? ""} email={profile.email} campus={profile.campus?.name ?? "Campus unavailable"} hasPhoto={Boolean(profile.photo_path)} photoUrl={photoUrl} />
      </section>
    </main>
  );
}
