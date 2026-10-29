import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261029110000_update_couple_partner_details.sql", "utf8");

describe("partner details RPC migration", () => {
  it("uses a narrow authenticated SECURITY DEFINER contract with a fixed search path", () => {
    expect(migration).toContain("create or replace function public.update_couple_partner_details(");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("revoke all on function public.update_couple_partner_details(uuid, uuid, text, text, text, text) from public, anon");
    expect(migration).toContain("grant execute on function public.update_couple_partner_details(uuid, uuid, text, text, text, text) to authenticated");
    expect(migration).toContain("target_gender is not null and target_gender not in ('male', 'female')");
  });

  it("limits Admins to actual Couple members and Counselors to assigned active Cases", () => {
    expect(migration).toContain("private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_has_role(array['counselor']::public.app_role[])");
    expect(migration).toContain("where counseling_case.couple_group_id = target_couple_group_id");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("counseling_case.status in ('active', 'pending_final')");
    expect(migration).toContain("couple_membership.profile_id = target_profile_id");
    expect(migration).toContain("membership.profile_id = target_profile_id");
    expect(migration).toContain("is_admin\n        or (couple.active and membership.ended_at is null)");
  });

  it("updates only intended contact fields and delegates gender to its existing audit RPC", () => {
    expect(migration).toContain("set first_name = btrim(target_first_name),\n      last_name = btrim(target_last_name),\n      phone = normalized_phone");
    expect(migration).not.toMatch(/set\s+[^;]*\bgender\s*=/i);
    expect(migration).toContain("perform public.update_couple_partner_gender(");
    expect(migration).toContain("if target_gender is not null then");
    expect(migration).not.toMatch(/public\.profiles\s+set\s+[^;]*email\s*=/i);
  });
});
