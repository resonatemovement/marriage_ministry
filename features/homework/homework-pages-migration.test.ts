import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261124163708_homework_pages.sql"), "utf8");
const verifier = readFileSync(join(process.cwd(), "features/homework/homework-pages-dev-verification.sql"), "utf8");

describe("versioned Homework pages migration contract", () => {
  it("stores page metadata and placement on versioned snapshots without rewriting legacy records", () => {
    expect(migration).toContain("alter table public.homework_versions add column page_manifest jsonb");
    expect(migration).toContain("alter table public.homework_version_blocks add column page_id uuid");
    expect(migration).not.toMatch(/^update public\.homework_(versions|version_blocks)\s+set/im);
  });

  it("uses an authenticated transactional authoring wrapper and clones published page snapshots", () => {
    expect(migration).toContain("public.save_session_homework_authoring_state_with_pages(");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("array['super_admin','admin','author']");
    expect(migration).toContain("public.save_session_homework_authoring_state(");
    expect(migration).toContain("page_manifest)");
    expect(migration).toContain("is_required,page_id)");
    expect(migration).toContain("save_session_homework_authoring_state_with_pages(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text,boolean,jsonb,uuid[],text)");
    expect(migration).toContain("grant execute on function public.save_session_homework_authoring_state_with_pages");
  });

  it("enforces title, order, content-per-page, legacy single-page fallback, and immutable published snapshots", () => {
    expect(migration).toContain("Each Homework page must contain at least one content block");
    expect(migration).toContain("Each Homework page needs a valid title and order");
    expect(migration).toContain("'title', 'Page 1'");
    expect(migration).toContain("Published Homework versions are immutable");
    expect(migration).toContain("Homework page deletion confirmation is required");
    expect(migration).toContain("id in (old.homework_version_id, new.homework_version_id)");
  });

  it("preserves Counselor review authorization while returning page-group metadata", () => {
    expect(migration).toContain("public.get_counselor_submitted_homework_review(target_progress_id uuid)");
    expect(migration).toContain("'pageId'");
    expect(migration).toContain("'pageTitle'");
    expect(migration).toContain("counselor_membership.profile_id = (select auth.uid())");
    expect(migration).toContain("grant execute on function public.get_counselor_submitted_homework_review(uuid) to authenticated");
  });

  it("provides rollback-only workflow verification without applying a migration", () => {
    expect(verifier.trimEnd().endsWith("rollback;")).toBe(true);
    for (const assertion of ["Save Draft must persist incomplete pages", "Block placement was not saved", "Homework page deletion confirmation is required", "Expected publish rejection for an empty page", "Valid multi-page Homework did not publish", "Editing a published version must create a draft"]) {
      expect(verifier).toContain(assertion);
    }
  });
});
