import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261116100000_shared_onboarding_completion_validation.sql", import.meta.url), "utf8");

describe("shared onboarding completion validation migration", () => {
  it("uses one requirement function for both completion RPCs and Admin readiness", () => {
    expect(migration.match(/private\.onboarding_completion_missing_requirements\(profile\)/g)).toHaveLength(3);
    expect(migration).toContain("private.profile_photo_is_saved(profile.id, profile.photo_path)");
    expect(migration).toContain("phone_digits !~ '^1[0-9]{10}$'");
    expect(migration).toContain("profile.status <> 'onboarding' or profile.onboarding_completed_at is not null");
  });

  it("locks and revalidates the target before atomic completion", () => {
    expect(migration.match(/where id = .* for update/g)).toHaveLength(2);
    expect(migration).toContain("where id = actor and status = 'onboarding' and onboarding_completed_at is null");
    expect(migration).toContain("where id = target_profile_id and status = 'onboarding' and onboarding_completed_at is null");
    expect(migration).toContain("set status = 'active', onboarding_completed_at = now()");
  });

  it("keeps completion and readiness RPCs restricted to authenticated authorized callers", () => {
    expect(migration).toContain("private.current_user_has_role(array['admin','super_admin']::public.app_role[])");
    expect(migration).toContain("revoke all on function public.admin_complete_onboarding(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.admin_complete_onboarding(uuid) to authenticated");
    expect(migration).toContain("revoke all on function public.admin_get_onboarding_readiness(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.admin_get_onboarding_readiness(uuid) to authenticated");
    expect(migration).toContain("'missing', to_jsonb(missing)");
  });
});
