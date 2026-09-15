export type AdminRecipientProfile = { id: string; email: string | null; status: string; profile_roles: { role: string }[] | null };
type EligibleAdminRecipient = { profileId: string; email: string };

export type IntakeRecipientProfile = AdminRecipientProfile & { campus_lead_assignments?: { campus_id: string; ended_at: string | null }[] | null };

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

export function eligibleIntakeRecipients(profiles: readonly IntakeRecipientProfile[], campusId: string | null): EligibleAdminRecipient[] {
  const seen = new Set<string>();
  return profiles.flatMap((profile) => {
    const email = profile.email?.trim().toLowerCase();
    const global = profile.profile_roles?.some(({ role }) => role === "admin" || role === "super_admin");
    const scoped = campusId !== null && profile.profile_roles?.some(({ role }) => role === "campus_lead") && profile.campus_lead_assignments?.some((assignment) => assignment.campus_id === campusId && assignment.ended_at === null);
    if (profile.status !== "active" || (!global && !scoped) || !email || seen.has(email)) return [];
    seen.add(email);
    return [{ profileId: profile.id, email }];
  });
}
