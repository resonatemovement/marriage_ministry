import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260924230000_session_homework_authoring_persistence.sql"), "utf8");
const verifier = readFileSync(join(process.cwd(), "features/homework/homework-builder-persistence-dev-verification.sql"), "utf8");

describe("Session and Homework transaction coordinator", () => {
  it("is a narrowly authorized transaction coordinator around existing lifecycle RPCs", () => {
    expect(migration).toContain("create function public.save_session_homework_authoring_state(");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("array['super_admin','admin','author']");
    expect(migration).toContain("public.save_session_builder_state(");
    expect(migration).toContain("public.get_or_create_homework_draft(");
    expect(migration).toContain("public.get_or_create_homework_draft_for_session(");
    expect(migration).toContain("public.publish_homework_version(version_id)");
    expect(migration).toContain("revoke all on function public.save_session_homework_authoring_state");
    expect(migration).toContain("grant execute on function public.save_session_homework_authoring_state");
  });

  it("supports optional Homework and preserves assigned published versions", () => {
    expect(migration).toContain("if target_homework_root_id is null and save_homework then");
    expect(migration).toContain("if version_row.status = 'published' and exists (");
    expect(migration).toContain("homework_assignment_revisions r where r.homework_version_id = version_id");
    expect(migration).toContain("source_version_id := version_id");
    expect(migration).toContain("if (select count(*) from public.homework_version_blocks where homework_version_id = version_id) > 0 then");
    expect(migration).not.toContain("delete from public.homework_blocks");
    expect(migration).not.toContain("homework_assignment_revisions set");
    expect(migration).not.toContain("public.force_update_homework_assignment");
    expect(migration).toContain("delete from public.homework_version_blocks vb\n        where vb.homework_version_id = version_id and not (vb.id = any(seen_snapshots))");
    expect(migration).not.toContain("delete from public.homework_version_blocks vb\n        where vb.homework_id");
  });

  it("reconciles only validated version snapshots and returns persisted client ID mappings", () => {
    for (const type of ["rich_text", "video_link", "long_answer"]) expect(migration).toContain(`'${type}'`);
    expect(migration).toContain("keys.key not in ('id','homework_block_id','client_id','block_type','title','rich_text_content','url','description')");
    expect(migration).toContain("where vb.id = submitted_snapshot_id and vb.homework_version_id = version_id");
    expect(migration).toContain("returning id into snapshot_id");
    expect(migration).toContain("'client_id', case when jsonb_typeof(item -> 'client_id') = 'string'");
    expect(migration).toContain("public.publish_homework_version(version_id)");
    expect(migration).not.toContain("insert into public.audit_events");
  });

  it("keeps the DEV integration verifier rollback-only and covers lifecycle and rollback cases", () => {
    expect(verifier.trimEnd().endsWith("rollback;")).toBe(true);
    for (const scenario of ["A: staged blocks", "B: Session publishes directly", "C: unassigned published content", "D: first edit", "E: the pending version", "F: Session changes roll back", "G: no empty Homework root", "H: the empty Homework Draft"]) {
      expect(verifier).toContain(scenario);
    }
  });
});
