import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260930120000_session_resource_library_integration.sql", import.meta.url), "utf8");
const verifier = readFileSync(new URL("./session-resource-library-dev-verification.sql", import.meta.url), "utf8");

describe("Session Resource Library relational contract", () => {
  it("stores one Resource FK with restrictive delete and a fixed category", () => {
    expect(migration).toContain("resource_id uuid references public.resources(id) on delete restrict");
    expect(migration).toContain("resource_category <> new.resource_category");
    expect(migration).toContain("actual_category <> item_resource_category");
    expect(migration).toContain("Archived Resource cannot be newly selected");
  });

  it("extends the transactional save and allows only linked archived author reads", () => {
    expect(migration).toContain("create or replace function public.save_session_builder_state(");
    expect(migration).toContain("resources_linked_archived_author_read");
    expect(migration).toContain("select 1 from public.session_material_blocks where resource_id = resources.id");
    expect(verifier.trimStart()).toMatch(/^-- DEV ONLY/);
    expect(verifier.trimEnd()).toMatch(/rollback;$/);
  });
});
