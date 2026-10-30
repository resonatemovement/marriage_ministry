import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261030100000_enforce_chronological_session_meetings.sql", "utf8");

describe("chronological Session meeting migration", () => {
  it("rejects a Session meeting that is not strictly after its Initial or prior Session meeting", () => {
    expect(migration).toContain("create or replace function private.enforce_chronological_session_meeting()");
    expect(migration).toContain("previous_meeting.case_session_id is null and current_sequence = 1");
    expect(migration).toContain("previous_session.actual_sequence < current_sequence");
    expect(migration).toContain("previous_meeting.case_session_id = new.case_session_id");
    expect(migration).toContain("new.starts_at <= previous_starts_at");
    expect(migration).toContain("using errcode = '22023'");
  });

  it("guards inserts and reschedules in the database and leaves Initial Meeting scheduling unchanged", () => {
    expect(migration).toContain("before insert or update of starts_at on public.case_session_meetings");
    expect(migration).toContain("if new.case_session_id is null then");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function private.enforce_chronological_session_meeting() from public, anon, authenticated");
    expect(migration).not.toMatch(/grant\s+execute/i);
  });
});
