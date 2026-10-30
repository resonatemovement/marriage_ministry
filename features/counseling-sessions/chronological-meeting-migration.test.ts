import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261030110000_require_later_calendar_date_for_sessions.sql", "utf8");
const initialMigration = readFileSync("supabase/migrations/20261030100000_enforce_chronological_session_meetings.sql", "utf8");

describe("chronological Session meeting migration", () => {
  it("rejects a Session scheduled on or before its predecessor's Los Angeles calendar date", () => {
    expect(migration).toContain("create or replace function private.enforce_chronological_session_meeting()");
    expect(migration).toContain("previous_meeting.case_session_id is null and current_sequence = 1");
    expect(migration).toContain("previous_session.actual_sequence < current_sequence");
    expect(migration).toContain("previous_meeting.case_session_id = new.case_session_id");
    expect(migration).toContain("(new.starts_at at time zone 'America/Los_Angeles')::date");
    expect(migration).toContain("<= (previous_starts_at at time zone 'America/Los_Angeles')::date");
    expect(migration).toContain("using errcode = '22023'");
    expect(migration).toContain("after the previous meeting date");
  });

  it("guards inserts and reschedules in the database and leaves Initial Meeting scheduling unchanged", () => {
    expect(initialMigration).toContain("before insert or update of starts_at on public.case_session_meetings");
    expect(migration).toContain("if new.case_session_id is null then");
    expect(migration).toContain("set search_path = ''");
    expect(initialMigration).toContain("revoke all on function private.enforce_chronological_session_meeting() from public, anon, authenticated");
    expect(migration).not.toMatch(/grant\s+execute/i);
  });
});
