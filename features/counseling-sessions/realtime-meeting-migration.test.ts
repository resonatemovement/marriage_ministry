import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261020100000_realtime_case_session_meetings.sql", import.meta.url), "utf8");

describe("Realtime Meeting publication migration", () => {
  it("idempotently adds only case Session Meetings without changing security or payload shape", () => {
    expect(migration).toContain("pg_catalog.pg_publication_tables");
    expect(migration).toContain("pubname = 'supabase_realtime'");
    expect(migration).toContain("tablename = 'case_session_meetings'");
    expect(migration).toContain("alter publication supabase_realtime add table public.case_session_meetings");
    expect(migration).not.toMatch(/homework_answers|case_session_material_blocks|homework_version|case_assignments|notification_deliveries|case_status_history/);
    expect(migration).not.toContain("replica identity");
    expect(migration).not.toMatch(/create policy|alter policy|grant |revoke /);
  });
});
