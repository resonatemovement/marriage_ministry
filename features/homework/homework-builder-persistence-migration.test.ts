import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261013120000_optional_session_homework.sql"), "utf8");
const authoring = migration.slice(0, migration.indexOf("create or replace function public.activate_first_case_session"));
const staleSelectionFix = readFileSync(join(process.cwd(), "supabase/migrations/20261013121000_validate_homework_selection.sql"), "utf8");
const verifier = readFileSync(join(process.cwd(), "features/homework/homework-builder-persistence-dev-verification.sql"), "utf8");

describe("Session and Homework transaction coordinator", () => {
  it("is a narrowly authorized transaction coordinator around existing lifecycle RPCs", () => {
    expect(authoring).toContain("create or replace function public.save_session_homework_authoring_state(");
    expect(authoring).toContain("security definer\nset search_path = ''");
    expect(authoring).toContain("array['super_admin','admin','author']");
    expect(authoring).toContain("public.save_session_builder_state(");
    expect(authoring).toContain("public.get_or_create_homework_draft(");
    expect(authoring).toContain("public.get_or_create_homework_draft_for_session(");
    expect(authoring).toContain("public.publish_homework_version(version_id)");
  });

  it("supports optional Homework and preserves assigned published versions", () => {
    expect(authoring).toContain("if target_homework_root_id is null and save_homework then");
    const noHomeworkBranch = authoring.match(/if save_homework or publish_homework then\s+if target_homework_root_id is null then([\s\S]*?)\n    else/);
    expect(noHomeworkBranch?.[1]).toMatch(/if save_homework and jsonb_array_length\(target_homework_blocks\) > 0 then\s+raise exception 'Homework draft is unavailable';/);
    expect(authoring).toContain("if publish_homework and version_id is not null then");
    expect(authoring).toContain("elsif publish_homework and target_homework_version_id is not null then");
    expect(authoring).toContain("Select a valid Homework draft or remove the unavailable Homework selection");
    expect(authoring).toContain("when version_id is not null then (select status::text from public.homework_versions where id = version_id)\n      else null end");
    expect(authoring).toContain("if version_row.status = 'published' and exists (");
    expect(authoring).toContain("homework_assignment_revisions r where r.homework_version_id = version_id");
    expect(authoring).toContain("source_version_id := version_id");
    expect(authoring).toContain("if (select count(*) from public.homework_version_blocks where homework_version_id = version_id) > 0 then");
    expect(authoring).not.toContain("delete from public.homework_blocks");
    expect(authoring).not.toContain("homework_assignment_revisions set");
    expect(authoring).not.toContain("public.force_update_homework_assignment");
    expect(authoring).toContain("delete from public.homework_version_blocks vb\n        where vb.homework_version_id = version_id and not (vb.id = any(seen_snapshots))");
    expect(authoring).not.toContain("delete from public.homework_version_blocks vb\n        where vb.homework_id");
  });

  it("reconciles only validated version snapshots and returns persisted client ID mappings", () => {
    for (const type of ["rich_text", "video_link", "long_answer"]) expect(authoring).toContain(`'${type}'`);
    expect(authoring).toContain("keys.key not in ('id','homework_block_id','client_id','block_type','title','rich_text_content','url','description')");
    expect(authoring).toContain("where vb.id = submitted_snapshot_id and vb.homework_version_id = version_id");
    expect(authoring).toContain("returning id into snapshot_id");
    expect(authoring).toContain("'client_id', case when jsonb_typeof(item -> 'client_id') = 'string'");
    expect(authoring).toContain("public.publish_homework_version(version_id)");
    expect(authoring).not.toContain("insert into public.audit_events");
  });

  it("keeps the DEV integration verifier rollback-only and covers lifecycle and rollback cases", () => {
    expect(verifier.trimEnd().endsWith("rollback;")).toBe(true);
    for (const scenario of ["A: staged blocks", "B: Session publishes directly", "C: unassigned published content", "D: first edit", "E: the pending version", "F: Session changes roll back", "G: no empty Homework root", "H: the empty Homework Draft"]) {
      expect(verifier).toContain(scenario);
    }
  });

  it("rejects a stale Homework version selection only when its Homework root is absent", () => {
    expect(staleSelectionFix).toContain("target_homework_version_id is not null");
    expect(staleSelectionFix).toContain("Select a valid Homework draft or remove the unavailable Homework selection");
    expect(staleSelectionFix).toContain("null to mean no Homework");
    expect(staleSelectionFix).toContain("refusing to apply stale-selection validation");
  });
});
