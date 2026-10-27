import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migration = new URL("../../supabase/migrations/20261027100000_limit_couple_session_content_to_snapshots.sql", import.meta.url);

describe("selective Session content Couple RLS migration", () => {
  it("removes direct Couple access to authored material and linked Resource metadata", async () => {
    const sql = await readFile(migration, "utf8");
    expect(sql).toContain("drop policy if exists session_material_blocks_couple_current_read");
    expect(sql).toContain("drop policy if exists resources_couple_current_session_read");
    expect(sql).not.toMatch(/drop policy[^;]+case_session_material_read_authorized/i);
    expect(sql).not.toMatch(/drop policy[^;]+resources_released_case_session_read/i);
    expect(sql).not.toMatch(/drop policy[^;]+resource_versions_released_case_session_read/i);
  });
});
