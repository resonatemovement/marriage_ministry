import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261020110000_realtime_case_sessions_and_cases.sql", import.meta.url), "utf8");

describe("Case lifecycle Realtime migration", () => {
  it("idempotently publishes only the Session and Case lifecycle signal tables", () => {
    expect(migration.match(/pg_publication_tables/g)).toHaveLength(2);
    expect(migration).toContain("alter publication supabase_realtime add table public.case_sessions");
    expect(migration).toContain("alter publication supabase_realtime add table public.counseling_cases");
    expect(migration).not.toMatch(/replica identity|create policy|grant |homework_answers|case_status_history|case_session_material_blocks|notification_deliveries/i);
  });
});
