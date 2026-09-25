import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260924090000_session_builder_transactional_persistence.sql"), "utf8");
const verifier = readFileSync(join(process.cwd(), "features/session-builder/session-builder-transactional-dev-verification.sql"), "utf8");

describe("transactional Session Builder contract", () => {
  it("exposes one authorized whole-state RPC for authenticated authors", () => {
    expect(migration).toContain("create function public.save_session_builder_state(");
    expect(migration).toContain("target_session_id uuid");
    expect(migration).toContain("target_material jsonb");
    expect(migration).toContain("target_intent text");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("array['super_admin', 'admin', 'author']");
    expect(migration).toContain("revoke all on function public.save_session_builder_state(uuid, text, jsonb, text) from public, anon");
    expect(migration).toContain("grant execute on function public.save_session_builder_state(uuid, text, jsonb, text) to authenticated");
  });

  it("supports new Drafts, direct Publish, and existing status preservation", () => {
    expect(migration).toContain("if target_session_id is null then");
    expect(migration).toContain("values (target_title, actor, 'draft')");
    expect(migration).toContain("target_intent = 'publish'");
    expect(migration).toContain("session_row.status = 'published'");
    expect(migration).toContain("status = final_status");
    expect(migration).toContain("'session_id', target_session_id");
    expect(migration).toContain("'blocks', ordered_blocks");
  });

  it("reconciles only owned material, retains IDs, and returns new client ID mappings", () => {
    expect(migration).toContain("where id = item_id and session_id = target_session_id");
    expect(migration).toContain("where session_id = target_session_id and not (id = any(seen_ids))");
    expect(migration).toContain("set position = position + temporary_offset");
    expect(migration).toContain("where id = saved_id and session_id = target_session_id");
    expect(migration).toContain("returning id into saved_id");
    expect(migration).toContain("'client_id', item_client_id");
    expect(migration).toContain("for update");
  });

  it("validates publication and has a rollback-only DEV scenario suite", () => {
    expect(migration).toContain("private.homework_json_has_meaningful_text(item_content)");
    expect(migration).toContain("Add at least one Session Material block before publishing");
    expect(migration).toContain("Enter a valid http or https URL for the Video / Link block");
    expect(verifier).toContain("begin;");
    expect(verifier).toContain("rollback;");
    for (const label of ["A:", "B:", "C:", "D:", "E:", "F:", "G:", "H:", "I:", "J:"]) {
      expect(verifier).toContain(label);
    }
  });
});
