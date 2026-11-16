import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261116120000_homework_paired_response_rows.sql", "utf8");

describe("paired Homework response row migration", () => {
  it("uses forward-compatible versioned Long Answer snapshots and preserves answer/RLS tables", () => {
    expect(migration).toContain("paired_rows_v1");
    expect(migration).toContain("public.homework_answers");
    expect(migration).not.toMatch(/alter\s+table/i);
    expect(migration).not.toMatch(/create\s+policy|drop\s+policy/i);
    expect(migration).toContain("before insert or update on public.homework_version_blocks");
    expect(migration).toContain("grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated");
    expect(migration).not.toContain("from public, anon, authenticated;\ngrant execute on function public.persist_participant_homework");
  });

  it("keeps the existing authenticated owner check and validates stable matching UUID pairs server-side", () => {
    expect(migration).toContain("alter function public.persist_participant_homework(uuid, jsonb, text) set schema private");
    expect(migration).toContain("progress.profile_id = (select auth.uid())");
    expect(migration).toContain("private.persist_participant_homework(target_progress_id, target_answers, target_intent)");
    expect(migration).toContain("left_ids is distinct from right_ids");
    expect(migration).toContain("row_id = any(seen_ids)");
  });

  it("allows incomplete draft and optional saves but enforces complete populated required pairs on submit", () => {
    expect(migration).toContain("target_intent = 'submit' and pair.both_required");
    expect(migration).toContain("if not has_complete or has_incomplete then raise exception");
    expect(migration).toContain("target_intent not in ('save','submit')");
    expect(migration).toContain("target_intent is null or target_answers is null");
  });

  it("accepts legacy metadata and legacy plain-text answers while supporting new row payloads", () => {
    expect(migration).toContain("key_count not in (7, 8)");
    expect(migration).toContain("left_column is not null or right_column is not null");
    expect(migration).toContain("private.homework_side_by_side_metadata");
  });
});
