import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261026110000_session_content_recommendations.sql", import.meta.url), "utf8");

describe("Session content recommendation contract", () => {
  it("backfills existing material while leaving new blocks off by default", () => {
    expect(migration).toContain("add column is_recommended boolean not null default false");
    expect(migration).toContain("update public.session_material_blocks\nset is_recommended = true");
    expect(migration).toContain("item_recommended := coalesce(item_recommended, false)");
  });

  it("enforces Admin ownership for direct writes and crafted RPC payloads", () => {
    expect(migration).toContain("enforce_session_material_recommendation_access");
    expect(migration).toContain("array['super_admin', 'admin']::public.app_role[]");
    expect(migration).toContain("Only Admins can change Session content recommendations");
    expect(migration).toContain("not can_manage_recommendations and item_recommended is not null");
    expect(migration).toContain("not can_manage_recommendations and coalesce(item_recommended, false)");
    expect(migration).toContain("security definer set search_path = ''");
  });

  it("preserves recommendation state and stable block identity through whole-state saves", () => {
    expect(migration).toContain("select is_recommended into existing_recommended");
    expect(migration).toContain("item_recommended := coalesce(item_recommended, existing_recommended)");
    expect(migration).toContain("where id = saved_id and session_id = target_session_id");
    expect(migration).toContain("'is_recommended', item_recommended");
  });

  it("does not alter assigned snapshots, Homework, scheduling, RLS, or grants beyond the existing RPC", () => {
    expect(migration).not.toContain("update public.case_session_material_blocks");
    expect(migration).not.toContain("alter table public.case_session_material_blocks");
    expect(migration).not.toContain("alter table public.homework");
    expect(migration).not.toContain("update public.homework");
    expect(migration).not.toContain("activate_first_case_session");
    expect(migration).not.toContain("complete_case_session_schedule_next");
    expect(migration).not.toContain("create policy");
    expect(migration).toContain("grant execute on function public.save_session_builder_state(uuid, text, jsonb, text) to authenticated");
  });
});
