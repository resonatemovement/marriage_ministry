import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261015150000_assignment_level_homework_persistence.sql", "utf8");

describe("assignment-level Homework persistence migration", () => {
  it("authorizes only the owning partner's active pinned assignment", () => {
    expect(migration).toContain("p.profile_id = auth.uid()");
    expect(migration).toContain("a.unassigned_at is null");
    expect(migration).toContain("r.ended_at is null");
    expect(migration).toContain("for update of a, p");
    expect(migration).toContain("progress_status in ('submitted', 'reviewed')");
    expect(migration).toContain("revoke all on function public.persist_participant_homework(uuid, jsonb, text) from public, anon");
    expect(migration).toContain("grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated");
  });

  it("validates every exact-version Long Answer before performing the atomic upsert", () => {
    const validation = migration.indexOf("Reject the entire payload before writing");
    const insert = migration.indexOf("insert into public.homework_answers");
    expect(validation).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(validation);
    expect(migration).toContain("block.homework_version_id = assigned_version_id");
    expect(migration).toContain("block.block_type = 'long_answer'");
    expect(migration).toContain("on conflict (participant_progress_id, homework_version_block_id)");
  });

  it("supports partial drafts and validates every required answer before submission", () => {
    expect(migration).toContain("where btrim(entry.value) <> '' or existing.id is not null");
    expect(migration).toContain("if target_intent = 'submit' then");
    expect(migration).toContain("Every Long Answer requires a meaningful answer");
    expect(migration).toContain("set status = 'submitted'");
    expect(migration).toContain("set status = 'in_progress'");
  });
});
