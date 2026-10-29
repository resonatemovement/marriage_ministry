import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261028120000_add_partner_gender_and_ordering.sql", "utf8");

describe("partner gender migration", () => {
  it("keeps existing records nullable and accepts only Male/Female values", () => {
    expect(migration).toContain("add column gender text");
    expect(migration).toContain("gender is null or gender in ('male', 'female')");
    const schemaChange = migration.split("-- Stage 1 keeps the existing RPC")[0];
    expect(schemaChange).not.toMatch(/update\s+public\.(profiles|intake_request_people)/i);
  });

  it("keeps the Stage 1 RPC compatible with legacy submissions and persists supplied genders", () => {
    expect(migration).toContain("Required database enforcement is intentionally deferred until Stage 2");
    expect(migration).toContain("item ? 'gender' and item->>'gender' is not null");
    expect(migration).not.toContain("Gender is required for each person");
    expect(migration).toContain("set gender = submission.person->>'gender'");
    expect(migration).toContain("update public.intake_request_people person");
    expect(migration).toContain("revoke all on function public.create_intake_request_without_gender(jsonb) from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.create_intake_request(jsonb) to service_role");
  });

  it("copies intake gender when an invited profile joins its Couple and scopes gender edits", () => {
    expect(migration).toContain("create trigger copy_intake_couple_gender_to_profile");
    expect(migration).toContain("after insert on public.group_members");
    expect(migration).toContain("and profile.gender is null");
    expect(migration).toContain("private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_has_role(array['counselor']::public.app_role[])");
    expect(migration).toContain("and (\n        is_admin\n        or (couple.active and membership.ended_at is null)\n      )");
    expect(migration).toContain("is_admin := private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])");
    expect(migration).toContain("and membership.profile_id = target_profile_id");
    expect(migration).toContain("and couple.group_type = 'couple'");
    expect(migration).toContain("counselor_membership.ended_at is null");
    expect(migration).toContain("counseling_case.status in ('active', 'pending_final')");
    expect(migration).toContain("counseling_case.closed_at is null");
    expect(migration).toContain("grant execute on function public.update_couple_partner_gender(uuid, uuid, text) to authenticated");
  });
});
