import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261128100000_session_builder_content_moves.sql", "utf8");
const actions = readFileSync("features/session-builder/move-content-actions.ts", "utf8");
const dialog = readFileSync("features/session-builder/move-to-session-dialog.tsx", "utf8");
const homeworkBuilder = readFileSync("features/homework/homework-builder-content.tsx", "utf8");
const materialBuilder = readFileSync("features/session-builder/session-material-editor.tsx", "utf8");

describe("Session Builder cross-Session content move contract", () => {
  it("exposes only move operations and adds them to existing Homework and material action menus", () => {
    expect(dialog).toContain("Move to Session");
    expect(dialog).toContain("Destination Session");
    expect(homeworkBuilder).toContain('kind="homework_page"');
    expect(homeworkBuilder).toContain('kind="homework_block"');
    expect(materialBuilder).toContain('"session_material_page" : "session_material_resource"');
    expect(dialog).not.toContain("Copy to Session");
    expect(actions).toContain('"move_session_builder_content_between_sessions"');
  });

  it("requires an active authoring role, exact source/destination revisions, and locks Sessions in stable order", () => {
    expect(migration).toContain("private.current_user_has_role(array['super_admin','admin','author']::public.app_role[])");
    expect(migration).toContain("order by s.id for update");
    expect(migration).toContain("source_session.updated_at is distinct from source_session_updated_at");
    expect(migration).toContain("destination_session.updated_at is distinct from destination_session_updated_at");
    expect(migration).toContain("source_version.updated_at is distinct from source_homework_updated_at");
    expect(migration).toContain("destination_version.updated_at is distinct from destination_homework_updated_at");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("from public, anon");
  });

  it("writes only draft Homework snapshots and creates destination-owned block identities", () => {
    expect(migration).toContain("public.get_or_create_homework_draft(source_homework_id, source_base_version_id)");
    expect(migration).toContain("public.get_or_create_homework_draft(destination_homework_id, destination_version.id)");
    expect(migration).toContain("insert into public.homework_blocks(homework_id) values(destination_homework_id)");
    expect(migration).toContain("delete from public.homework_version_blocks where id = row_item.id");
    expect(migration).toContain("private.homework_side_by_side_metadata");
    expect(migration).not.toMatch(/delete\s+from\s+public\.homework_answers/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.homework_assignment_revisions/i);
    expect(migration).not.toMatch(/update\s+public\.homework_answers/i);
  });

  it("limits Session Material moves to Draft Sessions because no separate material draft exists", () => {
    expect(migration).toContain("if source_session.status <> 'draft' or destination_session.status <> 'draft' then");
    expect(migration).toContain("Session Material moves require Draft Sessions");
    expect(dialog).toContain("session.status === \"draft\"");
  });

  it("keeps dialog selection and submission fail-closed for dirty, stale, or incomplete destinations", () => {
    expect(dialog).toContain("hasUnsavedSessionBuilderChangesInOtherTab(destination.id)");
    expect(dialog).toContain("if (dirtyInAnotherTab !== false)");
    expect(dialog).toContain("Save or discard source edits");
    expect(dialog).toContain("Destination Homework Page");
    expect(dialog).toContain("create a page before moving this item");
    expect(dialog).toContain("disabled={!canMove}");
    expect(actions).toContain("Reload both Sessions and try again.");
    expect(dialog).toContain("Open destination Session");
  });

  it("keeps the move flow accessible, responsive, cancelable, and draft-scoped for Session Material", () => {
    expect(dialog).toContain("<Dialog.Title");
    expect(dialog).toContain("<Dialog.Description");
    expect(dialog).toContain("aria-label=\"Destination Session\"");
    expect(dialog).toContain("onOpenChange={setOpen}");
    expect(dialog).toContain("Cancel</Dialog.Close>");
    expect(dialog).toContain("disabled={!canMove}");
    expect(dialog).toContain("max-h-[90dvh]");
    expect(dialog).toContain("sm:w-[min(520px,calc(100vw-2rem))]");
    expect(dialog).toContain('session.status === "draft"');
  });
});
