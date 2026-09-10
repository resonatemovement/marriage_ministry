export type AdminRecipientProfile = { id: string; email: string | null; status: string; profile_roles: { role: string }[] | null };
type EligibleAdminRecipient = { profileId: string; email: string };

export function eligibleAdminRecipients(profiles: readonly AdminRecipientProfile[]): EligibleAdminRecipient[] {
  const seen = new Set<string>();
  return profiles.flatMap((profile) => {
    const email = profile.email?.trim().toLowerCase();
    const eligible = profile.status === "active" && profile.profile_roles?.some(({ role }) => role === "admin" || role === "super_admin");
    if (!eligible || !email || seen.has(email)) return [];
    seen.add(email);
    return [{ profileId: profile.id, email }];
  });
}
