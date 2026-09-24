import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const foundation = readFileSync(join(process.cwd(), "supabase/migrations/20260923090000_homework_foundation.sql"), "utf8");
const correction = readFileSync(join(process.cwd(), "supabase/migrations/20260923211000_homework_foundation_corrections.sql"), "utf8");
const auditCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923212000_homework_audit_integrity.sql"), "utf8");
const answerCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923215000_homework_answer_integrity.sql"), "utf8");
const rootCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923220000_homework_root_authorization.sql"), "utf8");
const contentCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923221000_homework_content_history_integrity.sql"), "utf8");
const participantCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923223000_homework_participant_history_integrity.sql"), "utf8");
const relationalCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923224000_homework_relational_integrity.sql"), "utf8");
const identityCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923225000_homework_identity_history_integrity.sql"), "utf8");
const urlCorrection = readFileSync(join(process.cwd(), "supabase/migrations/20260923230000_homework_video_url_integrity.sql"), "utf8");

describe("Homework Foundation database contract", () => {
  it("keeps the required version, assignment, progress, and answer foundations", () => {
    for (const table of ["homeworks", "homework_versions", "homework_blocks", "homework_version_blocks", "homework_assignments", "homework_assignment_revisions", "homework_participant_progress", "homework_answers"]) expect(foundation).toContain(`create table public.${table}`);
    expect(foundation).toContain("homework_versions_one_draft_idx");
    expect(foundation).toContain("homework_assignments_active_unique_idx");
    expect(foundation).toContain("homework_assignment_revisions_one_active_idx");
    expect(foundation).toContain("prevent_assigned_homework_block_mutation");
  });

  it("counts only nonblank Tiptap text nodes as meaningful", () => {
    expect(correction).toContain("value ->> 'type' = 'text'");
    expect(correction).toContain("btrim(coalesce(value ->> 'text', '')) <> ''");
    expect(correction).toContain("jsonb_array_elements(value -> 'content')");
    expect(correction).not.toContain("jsonb_each(value)");
  });

  it("makes version lifecycle writes RPC-owned", () => {
    expect(correction).toContain("revoke insert, update, delete on public.homework_versions from authenticated");
    expect(correction).toContain("grant select on public.homework_versions to authenticated");
    expect(foundation).toContain("create function public.get_or_create_homework_draft");
    expect(foundation).toContain("create function public.publish_homework_version");
  });

  it("uses an append-only Homework audit destination without changing shared audit grants", () => {
    expect(auditCorrection).toContain("create table public.homework_audit_events");
    expect(auditCorrection).toContain("revoke all on public.homework_audit_events from anon, authenticated");
    expect(auditCorrection).not.toContain("grant insert on public.homework_audit_events to authenticated");
    expect(auditCorrection).not.toContain("grant update on public.homework_audit_events to authenticated");
    expect(auditCorrection).not.toContain("grant delete on public.homework_audit_events to authenticated");
    expect(auditCorrection).toContain("insert into public.homework_audit_events");
    expect(auditCorrection).not.toContain("public.audit_events");
  });

  it("requires an exact-version Long Answer through the authoritative answer trigger", () => {
    expect(answerCorrection).toContain("if not exists (");
    expect(answerCorrection).toContain("block.id = new.homework_version_block_id");
    expect(answerCorrection).toContain("block.homework_version_id = assigned_version_id");
    expect(answerCorrection).toContain("block.block_type = 'long_answer'");
    expect(answerCorrection).not.toContain("block_type_value <> 'long_answer'");
  });

  it("makes Homework root creation and lifecycle changes RPC-owned", () => {
    expect(rootCorrection).toContain("create function public.get_or_create_homework_draft_for_session(target_session_id uuid)");
    expect(rootCorrection).toContain("on conflict (session_id) do nothing");
    expect(rootCorrection).toContain("return public.get_or_create_homework_draft(target_homework_id)");
    expect(rootCorrection).toContain("and withdrawn_at is not null");
    expect(rootCorrection).toContain("revoke insert, update, delete on public.homeworks from authenticated");
    expect(rootCorrection).toContain("grant select on public.homeworks to authenticated");
  });

  it("checks both source and destination when snapshot content moves", () => {
    expect(contentCorrection).toContain("old_version_id := old.homework_version_id");
    expect(contentCorrection).toContain("new_version_id := new.homework_version_id");
    expect(contentCorrection).toContain("r.homework_version_id in (old_version_id, new_version_id)");
    expect(contentCorrection).toContain("if tg_op = 'DELETE' then return old");
    expect(contentCorrection).toContain("return new");
    expect(contentCorrection).toContain("security definer");
    expect(contentCorrection).toContain("set search_path = ''");
  });

  it("serializes first assignment with snapshot edits", () => {
    expect(contentCorrection).toContain("for update");
    expect(contentCorrection).toContain("before insert on public.homework_assignment_revisions");
    expect(contentCorrection).toContain("where v.id = new.homework_version_id");
  });

  it("keeps logical block ownership fixed and rejects cross-Homework snapshots", () => {
    expect(contentCorrection).toContain("new.homework_id is distinct from old.homework_id");
    expect(contentCorrection).toContain("before update on public.homework_blocks");
    expect(foundation).toContain("version_homework <> block_homework");
    expect(foundation).toContain("before insert or update on public.homework_version_blocks");
  });

  it("restricts answer saves and submissions to the caller's active revision", () => {
    for (const functionName of ["save_homework_answer", "submit_homework"]) {
      const body = participantCorrection.split(`create or replace function public.${functionName}`)[1]?.split("$$;")[0];
      expect(body).toBeDefined();
      expect(body).toContain("p.profile_id = auth.uid()");
      expect(body).toContain("a.unassigned_at is null");
      expect(body).toContain("r.ended_at is null");
      expect(body).toContain("for update of a, p");
      expect(body).toContain("if not found then raise exception");
    }
    expect(participantCorrection).toContain("progress_status in ('submitted', 'reviewed')");
    expect(participantCorrection).toContain("btrim(answer.answer_text) <> ''");
    expect(participantCorrection).toContain("answer.homework_version_block_id = b.id");
  });

  it("keeps progress creation private to trusted Homework operations", () => {
    expect(participantCorrection).toContain("revoke all on function private.create_homework_progress(uuid) from public, anon, authenticated");
    expect(auditCorrection).toContain("perform private.create_homework_progress(revision_id)");
    expect(auditCorrection).toContain("perform private.create_homework_progress(new_revision)");
  });

  it("rejects a revision whose version belongs to another Homework", () => {
    expect(relationalCorrection).toContain("join public.homework_versions v on v.homework_id = a.homework_id");
    expect(relationalCorrection).toContain("a.id = new.homework_assignment_id");
    expect(relationalCorrection).toContain("v.id = new.homework_version_id");
    expect(relationalCorrection).toContain("before insert or update on public.homework_assignment_revisions");
    expect(relationalCorrection).toContain("new.homework_assignment_id is distinct from old.homework_assignment_id");
    expect(relationalCorrection).toContain("new.homework_version_id is distinct from old.homework_version_id");
  });

  it("rejects each cross-Homework audit reference and preserves append-only events", () => {
    expect(relationalCorrection).toContain("a.id = new.homework_assignment_id and a.homework_id = new.homework_id");
    expect(relationalCorrection).toContain("v.id = new.from_version_id and v.homework_id = new.homework_id");
    expect(relationalCorrection).toContain("v.id = new.to_version_id and v.homework_id = new.homework_id");
    expect(relationalCorrection).toContain("before insert or update or delete on public.homework_audit_events");
    expect(relationalCorrection).toContain("Homework audit events are append-only");
    expect(auditCorrection).toContain("revoke all on public.homework_audit_events from anon, authenticated");
  });

  it("emits a creation event only for a newly inserted assignment", () => {
    expect(relationalCorrection).toContain("on conflict (homework_id, counseling_case_id) where unassigned_at is null do nothing");
    expect(relationalCorrection).toContain("created := found");
    expect(relationalCorrection).toContain("if created then\n    insert into public.homework_audit_events");
    expect(relationalCorrection).toContain("'homework_assignment_created'");
    expect(relationalCorrection).toContain("if active_version_id <> target_version_id then");
  });

  it("carries forward only answers from the old revision's version", () => {
    expect(relationalCorrection).toContain("ob.homework_version_id = old_revision.homework_version_id");
    expect(relationalCorrection).toContain("nb.homework_version_id = target_version_id");
    expect(relationalCorrection).toContain("nb.homework_block_id = ob.homework_block_id");
    expect(relationalCorrection).toContain("nb.rich_text_content = ob.rich_text_content");
    expect(relationalCorrection).toContain("nb.title is not distinct from ob.title");
    expect(relationalCorrection).toContain("select np.id, nb.id, oa.answer_text");
    expect(relationalCorrection).toContain("where oa.participant_progress_id = old_progress.id");
  });

  it("keeps version ancestry, assignments, progress, and answers bound to their original parents", () => {
    expect(identityCorrection).toContain("source.homework_id = new.homework_id");
    expect(identityCorrection).toContain("new.homework_id is distinct from old.homework_id");
    expect(identityCorrection).toContain("new.counseling_case_id is distinct from old.counseling_case_id");
    expect(identityCorrection).toContain("gm.profile_id = new.profile_id");
    expect(identityCorrection).toContain("before insert or update on public.homework_participant_progress");
    expect(identityCorrection).toContain("new.assignment_revision_id is distinct from old.assignment_revision_id");
    expect(identityCorrection).toContain("new.participant_progress_id is distinct from old.participant_progress_id");
    expect(identityCorrection).toContain("new.homework_version_block_id is distinct from old.homework_version_block_id");
    expect(identityCorrection).toContain("r.ended_at is null");
    expect(identityCorrection).toContain("a.unassigned_at is null");
  });

  it("does not expose Homework RPCs to anon after relational correction", () => {
    expect(relationalCorrection).toContain("revoke all on function public.get_or_create_homework_draft(uuid, uuid)");
    expect(relationalCorrection).toContain("public.force_update_homework_assignment(uuid, uuid, text) from public, anon");
  });

  it("requires a host in Homework video URLs", () => {
    expect(urlCorrection).toContain("create or replace function private.validate_homework_version_block()");
    expect(urlCorrection).toContain("new.url !~* '^https?://(");
    expect(urlCorrection).toContain("valid http or https URL with a host");
    expect(urlCorrection).toContain("version_homework <> block_homework");
    expect(urlCorrection).toContain("homework_json_has_meaningful_text");
  });
});
