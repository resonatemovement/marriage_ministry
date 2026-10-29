import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261029130000_assessments_database_foundation.sql", "utf8");
const scoringFix = readFileSync("supabase/migrations/20261029140000_fix_assessment_scoring_ambiguity.sql", "utf8");
const runtimeTest = readFileSync("supabase/tests/assessments_foundation_runtime.sql", "utf8");
const publish = migration.slice(migration.indexOf("create or replace function public.publish_assessment_version"), migration.indexOf("create or replace function public.set_assessment_counselor_preference"));
const configure = migration.slice(migration.indexOf("create or replace function public.configure_case_assessment_schedule"), migration.indexOf("create or replace function public.start_assessment_attempt"));
const submit = migration.slice(migration.indexOf("create or replace function public.submit_assessment_attempt"), migration.indexOf("create or replace function public.get_partner_assessment_score_history"));
const sharing = migration.slice(migration.indexOf("create or replace function public.get_partner_assessment_score_history"), migration.indexOf("insert into public.assessment_definitions"));

describe("Assessments database foundation migration", () => {
  it("keeps assessment content versioned and independent of Homework and Prepare & Enrich", () => {
    expect(migration).toContain("create table public.assessment_definitions");
    expect(migration).toContain("create table public.assessment_versions");
    expect(migration).toContain("create table public.assessment_questions");
    expect(migration).toContain("create table public.assessment_choices");
    expect(migration).toContain("create table public.assessment_choice_scores");
    expect(migration).not.toMatch(/homework_participant_progress|homework_answers|assessment_documents/);
    expect(migration).toContain("Published Assessment versions are immutable");
    expect(migration).toContain("status = 'draft'");
  });

  it("validates Love Languages publication shape without embedding questionnaire prompts", () => {
    expect(publish).toContain("question_count <> 30");
    expect(publish).toContain("exactly two choices");
    expect(publish).toContain("assessment_choice_scores");
    expect(publish).toContain("category_count <> 5");
    for (const key of ["words_of_affirmation", "quality_time", "receiving_gifts", "acts_of_service", "physical_touch"]) {
      expect(publish).toContain(key);
    }
    expect(publish).toContain("max_category_score > 12");
    expect(migration).toContain("'Paired-choice assessment. Questionnaire wording requires approved publication rights.'");
    expect(migration).not.toMatch(/insert into public\.assessment_questions|insert into public\.assessment_choices/);
  });

  it("persists the system Session 1 default and supports personal and Case-level precedence", () => {
    expect(migration).toContain("sequence_number = 1 and status = 'published'");
    expect(migration).toContain("assessment_system_defaults");
    expect(migration).toContain("assessment_counselor_preferences");
    expect(migration).toContain("assessment_case_overrides");
    expect(configure).toContain("case_override");
    expect(configure).toContain("counselor_preference");
    expect(configure).toContain("system_default");
    expect(migration).toContain("preference changes do not rewrite existing schedules");
    expect(configure).toContain("private.activate_case_assessment_schedule");
  });

  it("enforces Case and Counselor scope and keeps assessment writes behind authorized RPCs", () => {
    expect(migration).toContain("private.assessment_can_manage_case(target_case_id)");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("counseling_case.closed_at is null");
    expect(migration).toContain("private.current_user_has_role(array['counselor']::public.app_role[])");
    expect(migration).toContain("revoke all on public.assessment_definitions");
    expect(migration).toContain("grant execute on function public.publish_assessment_version");
    expect(migration).toContain("public.configure_case_assessment_schedule(uuid, uuid, uuid, uuid)");
    expect(migration).toContain("public.get_partner_assessment_score_history(uuid) from public, anon");
  });

  it("prevents cross-question selections, duplicate attempts, and post-submit mutation", () => {
    expect(migration).toContain("assessment_choices_question_version_fk");
    expect(migration).toContain("assessment_responses_choice_question_fk");
    expect(migration).toContain("assessment_attempts_number_unique");
    expect(migration).toContain("assessment_attempts_one_initial_idx");
    expect(migration).toContain("on conflict (participant_assignment_id, attempt_number) do nothing");
    expect(migration).toContain("assessment_responses_submitted_immutable");
    expect(migration).toContain("assessment_attempt_scores_submitted_immutable");
    expect(migration).toContain("assessment_attempts_submitted_immutable");
  });

  it("calculates five server-side scores, requires a complete response set, and preserves ties", () => {
    expect(submit).toContain("Answer every question before submitting");
    expect(submit).toContain("assessment_choice_scores");
    expect(submit).toContain("score = max_score");
    expect(submit).toContain("response_count <> expected_question_count");
    expect(submit).toContain("<> 5");
    expect(submit).toContain("score > 12");
    expect(submit).not.toMatch(/target_score|client_score|score_payload/);
    expect(scoringFix).toContain("ranked.score");
    expect(scoringFix).toContain("result.score > 12");
    expect(scoringFix).toContain("sum(result.score)");
  });

  it("keeps partner responses private and gates score-only sharing on both initial submissions", () => {
    expect(migration).toContain("create policy assessment_responses_owner_read");
    expect(migration).toContain("using (profile_id = auth.uid())");
    expect(sharing).toContain("own_initial.attempt_number = 1");
    expect(sharing).toContain("partner_initial.attempt_number = 1");
    expect(sharing).toContain("status = 'submitted'");
    expect(sharing).toContain("limit 5");
    expect(sharing).not.toContain("assessment_responses");
  });

  it("provides a rollback-only database regression matrix for publishing, ownership, RLS, and scoring", () => {
    expect(runtimeTest.trimStart()).toMatch(/^-- DEV-only/);
    expect(runtimeTest.trimEnd()).toMatch(/rollback;$/i);
    expect(runtimeTest).toContain("Love Languages requires exactly 30 questions");
    expect(runtimeTest).toContain("Every paired-choice question must have exactly two choices");
    expect(runtimeTest).toContain("category maximum cannot exceed 12");
    expect(runtimeTest).toContain("invalid Love Languages scoring key was not rejected");
    expect(runtimeTest).toContain("Unassigned Counselor read Assessment results");
    expect(runtimeTest).toContain("Couple read another participant''s answers");
    expect(runtimeTest).toContain("Partner results were shared before both initial submissions");
    expect(runtimeTest).toContain("sum(result.score)");
  });
});
