import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261026120000_selective_session_content_assignment.sql", "utf8");
const activation = migration.slice(migration.indexOf("create function public.activate_first_case_session"), migration.indexOf("revoke all on function public.activate_first_case_session"));
const progression = migration.slice(migration.indexOf("create function public.complete_case_session_schedule_next"), migration.indexOf("revoke all on function public.complete_case_session_schedule_next"));
const snapshot = migration.slice(migration.indexOf("create or replace function private.snapshot_selected_session_material"), migration.indexOf("revoke all on function private.snapshot_selected_session_material"));

describe("selective Session content assignment migration", () => {
  it("replaces rather than overloads both lifecycle RPC signatures and preserves RPC-only grants", () => {
    expect(migration).toContain("drop function public.activate_first_case_session(uuid, uuid, timestamptz, timestamptz)");
    expect(migration).toContain("drop function public.complete_case_session_schedule_next(uuid, uuid, timestamptz, timestamptz, text)");
    expect(migration).toContain("target_selected_material_block_ids uuid[]");
    expect(migration).toContain("revoke all on function public.activate_first_case_session(uuid, uuid, uuid[], timestamptz, timestamptz)");
    expect(migration).toContain("grant execute on function public.complete_case_session_schedule_next(uuid, uuid, uuid[], timestamptz, timestamptz, text)\n  to authenticated");
  });

  it("exposes only ordered labels and recommendation metadata to authorized scheduling roles", () => {
    const options = migration.slice(migration.indexOf("create or replace function public.get_published_session_material_options"), migration.indexOf("revoke all on function public.get_published_session_material_options"));
    expect(options).toContain("'super_admin', 'admin', 'campus_lead', 'coach', 'counselor'");
    expect(options).toContain("where session_template.status = 'published'");
    expect(options).toContain("order by session_template.sequence_number, block.position, block.id");
    expect(options).not.toMatch(/rich_text_content|block\.url|resource\.current_version_id/);
  });

  it("rejects empty, duplicate, unknown, deleted, cross-Session, and stale Resource selections", () => {
    expect(snapshot).toContain("cardinality(target_selected_material_block_ids) = 0");
    expect(snapshot).toContain("count(distinct selected_id)");
    expect(snapshot).toContain("block.session_id = target_session_id");
    expect(snapshot).toContain("selected_count <> cardinality(target_selected_material_block_ids)");
    expect(snapshot).toContain("resource.current_version_id is null");
    expect(snapshot).toContain("A selected Session Resource is unavailable");
  });

  it("snapshots only selected blocks in authored order with current Resource versions", () => {
    expect(snapshot).toContain("insert into public.case_session_material_blocks");
    expect(snapshot).toContain("block.id = any(target_selected_material_block_ids)");
    expect(snapshot).toContain("resource.current_version_id");
    expect(snapshot).toContain("order by block.position, block.id");
    expect(snapshot).not.toMatch(/update public\.case_session_material_blocks|delete from public\.case_session_material_blocks/);
    expect(activation).toContain("perform private.snapshot_selected_session_material(");
    expect(progression).toContain("perform private.snapshot_selected_session_material(");
  });

  it("keeps Homework pinning, progression gates, overrides, Session numbering, and Meeting creation in the existing transactions", () => {
    expect(activation).toContain("row_number() over (order by session_template.sequence_number)");
    expect(activation).toContain("private.create_homework_progress(revision_id)");
    expect(activation).toContain("insert into public.case_session_meetings");
    expect(progression).toContain("Both partners must submit Homework");
    expect(progression).toContain("case_session.homework_override");
    expect(progression).toContain("current_session.actual_sequence + 1");
    expect(progression).toContain("private.create_homework_progress(revision_id)");
    expect(progression).toContain("insert into public.case_session_meetings");
  });
});
