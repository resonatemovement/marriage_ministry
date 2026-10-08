import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261006120000_couple_workspace_access.sql", import.meta.url);

describe("Couple Workspace access migration", () => {
  it("limits Couple reads to the current scheduled session and Couple Version", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("current_user_can_read_current_couple_session");
    expect(sql).toContain("sessions_couple_current_read");
    expect(sql).toContain("session_material_blocks_couple_current_read");
    expect(sql).toContain("document_slot = 'couple'");
    expect(sql).not.toContain("document_slot = 'counselor'\n      and (select private.current_user_has_role(array['couple']");
  });
});
