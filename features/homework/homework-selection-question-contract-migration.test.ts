import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261023110000_homework_selection_question_contract.sql"),
  "utf8",
);
const scalarArrayFix = readFileSync(
  join(process.cwd(), "supabase/migrations/20261026100000_fix_homework_selection_scalar_array_checks.sql"),
  "utf8",
);
const scalarArrayVerifier = readFileSync(
  join(process.cwd(), "features/homework/homework-selection-submission-fix-dev-verification.sql"),
  "utf8",
);

function functionDefinition(source: string, name: string) {
  const start = source.indexOf(`create or replace function public.${name}(`);
  const end = source.indexOf("\n$$;", start);
  if (start < 0 || end < 0) throw new Error(`Missing ${name} definition`);
  return source.slice(start, end + 4);
}

describe("Homework selection question data contract migration", () => {
  it("adds versioned question metadata without rewriting legacy blocks", () => {
    expect(migration).toContain("add column question_choices jsonb");
    expect(migration).toContain("add column is_required boolean not null default true");
    expect(migration).toContain("'checkbox_question', 'radio_question'");
    expect(migration).not.toMatch(/update public\.homework_version_blocks\s+set question_choices/i);
  });

  it("keeps stable ordered choices in cloned and saved snapshots", () => {
    expect(migration).toContain("rich_text_content, url, description, question_choices, is_required");
    expect(migration).toContain("question_choices = item_choices, is_required = item_required");
    expect(migration).toContain("'question_choices', item_choices, 'is_required', item_required");
    expect(migration).toContain("order by position");
  });

  it("allows incomplete drafts but validates complete questions at publication", () => {
    expect(migration).toContain("create or replace function private.homework_question_is_publishable");
    expect(migration).toContain("jsonb_array_length(choices) >= 2");
    expect(migration).toContain("count(distinct choice ->> 'id')");
    expect(migration).toContain("btrim(choice ->> 'label') = ''");
    expect(migration).toContain("Complete each selection question before publishing");
    expect(migration.indexOf("Complete each selection question before publishing"))
      .toBeLessThan(migration.indexOf("set status = 'published'"));
  });

  it("preserves text answers and adds typed JSON selection answers", () => {
    expect(migration).toContain("add column answer_value jsonb");
    expect(migration).toContain("case when block.block_type = 'long_answer' then entry.value #>> '{}' else '' end");
    expect(migration).toContain("case when block.block_type = 'long_answer' then null else entry.value end");
    expect(migration).toContain("do update set answer_text = excluded.answer_text, answer_value = excluded.answer_value");
  });

  it("validates response types, pinned blocks, choices, and checkbox uniqueness", () => {
    expect(migration).toContain("block.homework_version_id = assigned_version_id");
    expect(migration).toContain("block.block_type not in ('long_answer', 'checkbox_question', 'radio_question')");
    expect(migration).toContain("Radio responses must contain one choice ID");
    expect(migration).toContain("Checkbox responses must contain choice IDs");
    expect(migration).toContain("Selection response contains an unknown choice");
    expect(migration).toContain("Checkbox responses cannot contain duplicate choices");
  });

  it("enforces required responses only on submit", () => {
    const submitValidation = migration.indexOf("if target_intent = 'submit' then");
    expect(submitValidation).toBeGreaterThan(-1);
    expect(migration.indexOf("block.block_type = 'radio_question' and block.is_required", submitValidation)).toBeGreaterThan(submitValidation);
    expect(migration.indexOf("block.block_type = 'checkbox_question' and block.is_required", submitValidation)).toBeGreaterThan(submitValidation);
    expect(migration).toContain("Every required Homework response needs a meaningful answer");
  });

  it("keeps participant ownership and submitted-answer protections", () => {
    expect(migration).toContain("p.profile_id = auth.uid()");
    expect(migration).toContain("a.unassigned_at is null");
    expect(migration).toContain("r.ended_at is null");
    expect(migration).toContain("Submitted answers are read-only");
    expect(migration).toContain("grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated");
    expect(migration).not.toMatch(/grant (insert|update|delete) on public\.homework_answers to authenticated/i);
  });

  it("carries unchanged selection answers through an authorized forced version update", () => {
    expect(migration).toContain("create or replace function public.force_update_homework_assignment");
    expect(migration).toContain("nb.question_choices is not distinct from ob.question_choices");
    expect(migration).toContain("nb.is_required = ob.is_required");
    expect(migration).toContain("oa.answer_text, oa.answer_value");
  });
});

describe("Homework selection scalar/array correction", () => {
  it("changes only the three unsafe non-empty Checkbox predicates", () => {
    const expectedPersistence = functionDefinition(migration, "persist_participant_homework")
      .replaceAll("jsonb_array_length(answer.answer_value) > 0", "answer.answer_value <> '[]'::jsonb");
    const expectedForceUpdate = functionDefinition(migration, "force_update_homework_assignment")
      .replaceAll("jsonb_array_length(oa.answer_value) > 0", "oa.answer_value <> '[]'::jsonb");

    expect(functionDefinition(scalarArrayFix, "persist_participant_homework")).toBe(expectedPersistence);
    expect(functionDefinition(scalarArrayFix, "force_update_homework_assignment")).toBe(expectedForceUpdate);
    expect(scalarArrayFix.match(/answer\.answer_value <> '\[\]'::jsonb/g)).toHaveLength(2);
    expect(scalarArrayFix.match(/oa\.answer_value <> '\[\]'::jsonb/g)).toHaveLength(1);
    expect(scalarArrayFix).not.toMatch(/jsonb_array_length\((?:answer|oa)\.answer_value\)/);
  });

  it("preserves the RPC security boundary and avoids unrelated schema or policy changes", () => {
    for (const name of ["persist_participant_homework", "force_update_homework_assignment"]) {
      const definition = functionDefinition(scalarArrayFix, name);
      expect(definition).toContain("security definer");
      expect(definition).toContain("set search_path = ''");
    }
    expect(scalarArrayFix).toContain("p.profile_id = auth.uid()");
    expect(scalarArrayFix).toContain("a.unassigned_at is null");
    expect(scalarArrayFix).toContain("r.ended_at is null");
    expect(scalarArrayFix).toContain("Submitted answers are read-only");
    expect(scalarArrayFix).toContain("revoke all on function public.persist_participant_homework(uuid, jsonb, text) from public, anon");
    expect(scalarArrayFix).toContain("grant execute on function public.persist_participant_homework(uuid, jsonb, text) to authenticated");
    expect(scalarArrayFix).not.toMatch(/(?:create|alter|drop)\s+(?:table|policy)|delete\s+from|grant\s+(?:insert|update|delete)/i);
  });

  it("provides a rollback-only executable regression for mixed answers and force update", () => {
    expect(scalarArrayVerifier.trimStart().startsWith("-- Focused linked-DEV verifier")).toBe(true);
    expect(scalarArrayVerifier.trimEnd().endsWith("rollback;")).toBe(true);
    expect(scalarArrayVerifier).toContain("Mixed Save Draft did not become in_progress");
    expect(scalarArrayVerifier).toContain("Mixed answers did not submit with optional selections unanswered");
    expect(scalarArrayVerifier).toContain("Expected required Checkbox rejection");
    expect(scalarArrayVerifier).toContain("Expected required Radio rejection");
    expect(scalarArrayVerifier).toContain("Legacy Long Answer-only submission failed");
    expect(scalarArrayVerifier).toContain("Expected unknown Radio choice rejection");
    expect(scalarArrayVerifier).toContain("Expected duplicate Checkbox rejection");
    expect(scalarArrayVerifier).toContain("Expected malformed Checkbox rejection");
    expect(scalarArrayVerifier).toContain("Expected cross-partner ownership rejection");
    expect(scalarArrayVerifier).toContain("Forced version update did not preserve completed mixed responses");
  });
});
