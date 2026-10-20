import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261019100000_realtime_homework_progress.sql", import.meta.url), "utf8");

describe("Realtime Homework progress publication migration", () => {
  it("publishes only participant progress without changing RLS or replica identity", () => {
    expect(migration).toContain("alter publication supabase_realtime");
    expect(migration).toContain("add table public.homework_participant_progress");
    expect(migration).not.toContain("homework_answers");
    expect(migration).not.toContain("homework_assignment_revisions");
    expect(migration).not.toContain("homework_versions");
    expect(migration).not.toContain("homework_version_blocks");
    expect(migration).not.toContain("replica identity");
    expect(migration).not.toContain("create policy");
    expect(migration).not.toContain("alter policy");
  });
});
