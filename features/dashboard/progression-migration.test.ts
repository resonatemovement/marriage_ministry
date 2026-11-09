import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261109120000_dashboard_counseling_progression.sql", "utf8");

describe("Dashboard progression aggregate RPC", () => {
  it("is authenticated, read-only, and limited to Admin/Super Admin or Campus Lead scope", () => {
    expect(migration).toContain("stable");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("array['admin', 'super_admin']");
    expect(migration).toContain("array['campus_lead']");
    expect(migration).toContain("campus_lead_assignments");
    expect(migration).toContain("campus.active");
    expect(migration).toContain("couple.campus_id in (select campus_id from active_campuses)");
    expect(migration).toContain("revoke all on function public.get_dashboard_counseling_progression() from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.get_dashboard_counseling_progression() to authenticated");
    expect(migration).not.toMatch(/\b(insert into|update public\.|delete from)\b/i);
  });

  it("counts only current Case state, Counselor-of-record, active Session progression, and published definitions", () => {
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("request.invited_group_id is null");
    expect(migration).toContain("session_template.status = 'published'");
    expect(migration).toContain("case_session.status = 'active'");
    expect(migration).toContain("row_number() over (order by session_template.sequence_number)");
    expect(migration).toContain("couple.case_status = 'finished'");
    expect(migration).toContain("couple.case_status = 'referred'");
    expect(migration).toContain("couple.case_status = 'inactive'");
    expect(migration).not.toContain("case_status_history");
    expect(migration).not.toContain("homework");
    expect(migration).not.toContain("assessment");
  });
});
