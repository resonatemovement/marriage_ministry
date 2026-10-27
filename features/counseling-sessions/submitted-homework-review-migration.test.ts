import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261027110000_counselor_submitted_homework_review.sql", "utf8");
const partnerIsolation = readFileSync("supabase/migrations/20261027120000_tighten_homework_review_partner_isolation.sql", "utf8");

describe("Counselor submitted Homework review RPC migration", () => {
  it("uses a narrow authenticated-only definer RPC without granting direct answer reads", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.get_counselor_submitted_homework_review(uuid) from public, anon");
    expect(migration).toContain("grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated");
    expect(migration).not.toMatch(/grant\s+select\s+on\s+public\.homework_answers/i);
    expect(migration).not.toMatch(/create\s+policy/i);
  });

  it("requires the active Counselor-of-record team, submitted status, and the exact progress row", () => {
    expect(migration).toContain("assignment_type = 'counselor'");
    expect(migration).toContain("counselor_assignment.ended_at is null");
    expect(migration).toContain("counselor_membership.profile_id = (select auth.uid())");
    expect(migration).toContain("counselor_membership.ended_at is null");
    expect(migration).toContain("progress.id = target_progress_id");
    expect(migration).toContain("progress.status in ('submitted', 'reviewed')");
    expect(migration).toContain("progress.submitted_at is not null");
    expect(migration).toContain("block.homework_version_id = revision.homework_version_id");
    expect(migration).toContain("order by block.position");
  });

  it("returns immutable assigned wording, choices, and each supported answer shape", () => {
    expect(migration).toContain("block.rich_text_content");
    expect(migration).toContain("block.question_choices");
    expect(migration).toContain("answer.answer_text");
    expect(migration).toContain("answer.answer_value");
    expect(migration).toContain("'long_answer', 'checkbox_question', 'radio_question'");
  });

  it("denies the review RPC to either Couple partner even if they also hold a Counselor role", () => {
    expect(partnerIsolation).toContain("create or replace function public.get_counselor_submitted_homework_review");
    expect(partnerIsolation).toContain("and not exists (");
    expect(partnerIsolation).toContain("counseling_case.couple_group_id");
    expect(partnerIsolation).toContain("couple_membership.profile_id = (select auth.uid())");
    expect(partnerIsolation).toContain("couple_membership.ended_at is null");
    expect(partnerIsolation).toContain("grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated");
  });
});
