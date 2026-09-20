import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/navigation/workspace-shell";
import { ProfileEdit } from "@/features/onboarding/profile-edit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireDefaultWorkspace } from "@/lib/auth/session";
import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";

export default async function ProfileRoute() {
  const { identity, workspace } = await requireDefaultWorkspace("/profile");
  const supabase = await createServerSupabaseClient(); const { data: claims } = await supabase.auth.getClaims(); const id = claims?.claims?.sub;
  if (typeof id !== "string") redirect("/login");
  const { data: rawProfile } = await supabase.from("profiles").select("id,first_name,last_name,email,phone,photo_path,campus:campuses(name),status").eq("id", id).maybeSingle();
  const profile = rawProfile as unknown as { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; photo_path: string | null; status: string; campus: { name: string } | null } | null;
  if (!profile || profile.status !== "active") redirect("/workspace");
  const photoUrl = await getProfilePhotoUrl(profile.photo_path);
  return <WorkspaceShell workspace={workspace} activeHref="/profile" identity={identity}><main className="mx-auto max-w-6xl p-5 sm:p-8"><h1 className="font-heading text-3xl font-bold text-text-primary">My profile</h1><p className="mt-2 text-sm text-text-muted">Update your name, phone, and required photo. Email and campus are managed by Resonate.</p><div className="mt-6"><ProfileEdit profileId={profile.id} firstName={profile.first_name} lastName={profile.last_name} phone={profile.phone ?? ""} email={profile.email ?? "Not provided"} campus={profile.campus?.name ?? "Campus not assigned"} hasPhoto={Boolean(profile.photo_path)} photoUrl={photoUrl} /></div></main></WorkspaceShell>;
}
