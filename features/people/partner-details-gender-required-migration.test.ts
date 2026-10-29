import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261029120000_require_gender_for_partner_details.sql", "utf8");

describe("required partner gender migration", () => {
  it("rejects missing or unsupported gender in the atomic details RPC", () => {
    expect(migration).toContain("if target_gender is null or target_gender not in ('male', 'female') then");
    expect(migration).toContain("perform public.update_couple_partner_gender(");
    expect(migration).not.toContain("if target_gender is not null then");
    expect(migration).toContain("set first_name = btrim(target_first_name),\n      last_name = btrim(target_last_name),\n      phone = normalized_phone");
    expect(migration).toContain("security definer\nset search_path = ''");
  });

  it("preserves authorization, membership validation, and the narrow RPC grant", () => {
    expect(migration).toContain("private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_has_role(array['counselor']::public.app_role[])");
    expect(migration).toContain("counseling_case.status in ('active', 'pending_final')");
    expect(migration).toContain("where couple.id = target_couple_group_id");
    expect(migration).toContain("membership.profile_id = target_profile_id");
    expect(migration).toContain("revoke all on function public.update_couple_partner_details(uuid, uuid, text, text, text, text) from public, anon");
    expect(migration).toContain("grant execute on function public.update_couple_partner_details(uuid, uuid, text, text, text, text) to authenticated");
    expect(migration).not.toMatch(/set\s+[^;]*\bgender\s*=/i);
  });
});
