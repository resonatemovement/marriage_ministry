import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261023100000_meeting_notification_realtime_signal.sql", import.meta.url),
  "utf8",
);

describe("Meeting notification Realtime signal migration", () => {
  it("creates one narrow signal row per Meeting with an atomic revision", () => {
    expect(migration).toContain("create table public.meeting_notification_update_signals");
    expect(migration).toContain("meeting_id uuid primary key references public.case_session_meetings(id) on delete cascade");
    expect(migration).toContain("counseling_case_id uuid not null references public.counseling_cases(id) on delete cascade");
    expect(migration).toContain("revision bigint not null default 1");
    expect(migration).toContain("revision = public.meeting_notification_update_signals.revision + 1");
    expect(migration).not.toMatch(/recipient_email|recipient_profile_id|provider_message_id|delivery_key|resend_of_delivery_id/);
  });

  it("allows only authorized readers and grants browser roles no writes", () => {
    expect(migration).toContain("alter table public.meeting_notification_update_signals enable row level security");
    expect(migration).toContain("revoke all on public.meeting_notification_update_signals from public, anon, authenticated");
    expect(migration).toContain("grant select on public.meeting_notification_update_signals to authenticated");
    expect(migration).toContain("private.current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(migration).toContain("private.current_user_can_manage_counseling_case(counseling_case_id)");
    expect(migration).not.toMatch(/grant (insert|update|delete|all) on public\.meeting_notification_update_signals to (anon|authenticated)/i);
  });

  it("advances only for presentation-relevant Meeting delivery changes", () => {
    expect(migration).toContain("after insert or update of status, error_category, error_message");
    expect(migration).toContain("new.meeting_id is null or new.counseling_case_id is null");
    expect(migration).toContain("row(new.status, new.error_category, new.error_message)");
    expect(migration).toContain("is not distinct from row(old.status, old.error_category, old.error_message)");
    expect(migration).toContain("meeting.id = new.meeting_id");
    expect(migration).toContain("meeting.counseling_case_id = new.counseling_case_id");
    expect(migration).not.toMatch(/update public\.notification_deliveries|insert into public\.notification_deliveries/);
  });

  it("publishes only the narrow signal without full replica identity", () => {
    expect(migration).toContain("alter publication supabase_realtime");
    expect(migration).toContain("add table public.meeting_notification_update_signals");
    expect(migration).not.toMatch(/add table public\.(notification_deliveries|notification_webhook_events)/);
    expect(migration).not.toContain("replica identity full");
  });

  it("protects the trigger function as a database-owned path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function private.advance_meeting_notification_update_signal() from public, anon, authenticated");
    expect(migration).not.toMatch(/execute\s+format|dynamic sql/i);
  });
});
