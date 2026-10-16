import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Admin reminder settings integration", () => {
  it("adds the global reminder form to Admin Settings with one explicit save action", () => {
    const page = readFileSync("app/settings/page.tsx", "utf8");
    const component = readFileSync("features/settings/reminder-settings.tsx", "utf8");
    expect(page).toContain("<ReminderSettings initialSettings={reminderSettings}");
    expect(component).toContain("Meeting Reminders");
    expect(component).toContain("Homework Reminders");
    expect(component).toContain("Checked hourly");
    expect(component).toContain("All campuses");
    expect(component.match(/Save Changes/g)).toHaveLength(1);
    expect(component).toContain("disabled={!dirty || pending}");
    expect(component).toContain("noValidate");
  });

  it("uses the shared Input and shadCN Radix Switch without exposing scheduler credentials", () => {
    const component = readFileSync("features/settings/reminder-settings.tsx", "utf8");
    const toggle = readFileSync("components/ui/switch.tsx", "utf8");
    expect(component).toContain('from "@/components/ui/input"');
    expect(component).toContain('from "@/components/ui/switch"');
    expect(toggle).toContain('from "radix-ui"');
    expect(component).not.toMatch(/CRON_SECRET|Vault|Resend/i);
  });

  it("enforces Admin/Super Admin updates in both the server action and database RPC", () => {
    const action = readFileSync("features/settings/reminder-settings-actions.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20261016110000_global_reminder_settings.sql", "utf8");
    expect(action).toContain('requireOneOfRoles(["admin", "super_admin"]');
    expect(migration).toContain("private.current_user_has_role(array['super_admin', 'admin']");
    expect(migration).toContain("revoke all on public.global_reminder_settings from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.update_global_reminder_settings");
    expect(migration).toContain("check (id = 'global')");
  });
});
