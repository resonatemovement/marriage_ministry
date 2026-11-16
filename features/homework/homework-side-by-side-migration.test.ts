import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261116110000_homework_side_by_side_responses.sql", "utf8");

describe("Side-by-Side Homework migration", () => {
  it("reuses the versioned Long Answer and per-block answer schema without table, RLS, or grant broadening", () => {
    expect(migration).toContain("two existing Long Answer snapshot");
    expect(migration).not.toMatch(/alter\s+table/i);
    expect(migration).not.toMatch(/create\s+policy|drop\s+policy/i);
    expect(migration).toContain("public.homework_answers");
    expect(migration).toContain("and p.profile_id = auth.uid()");
    expect(migration).toContain("grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated");
    expect(migration).toContain("grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated");
    expect(migration).not.toContain("grant select on public.homework_answers");
  });

  it("validates complete paired metadata before publishing and allows partial answers only when configured optional", () => {
    expect(migration).toContain("private.homework_side_by_side_pair_is_valid");
    expect(migration).toContain("Complete each Side-by-Side Response before publishing");
    expect(migration).toContain("and private.homework_side_by_side_metadata(block.description) ->> 'bothRequired' = 'false'");
    expect(migration).toContain("Every required Homework response needs a meaningful answer");
    expect(migration).toContain("nb.description is not distinct from ob.description");
  });

  it("preserves Counselor-of-record membership and Couple-user denial in the review RPC", () => {
    expect(migration).toContain("counselor_assignment.assignment_type = 'counselor'");
    expect(migration).toContain("counselor_membership.profile_id = (select auth.uid())");
    expect(migration).toContain("not exists (select 1 from public.counseling_cases counseling_case");
    expect(migration).toContain("and block.block_type in ('long_answer', 'checkbox_question', 'radio_question')");
    expect(migration).toContain("'description', block.description");
  });
});
