import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261028130000_audit_profile_gender_changes.sql",
  "utf8",
);
const stageOne = readFileSync(
  "supabase/migrations/20261028120000_add_partner_gender_and_ordering.sql",
  "utf8",
);
const invitationFix = readFileSync(
  "supabase/migrations/20261029100000_fix_invitation_gender_transfer_authorization.sql",
  "utf8",
);

describe("profile gender audit guard migration", () => {
  it("guards every changed gender and audits it once from a hardened trigger", () => {
    expect(migration).toContain("before update of gender on public.profiles");
    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).toContain("if new.gender is not distinct from old.gender then\n    return new;");
    expect(migration).toContain("if new.gender is not null and new.gender not in ('male', 'female')");
    expect(migration.match(/insert into public\.audit_events/gi)).toHaveLength(1);
    expect(migration).toContain("'old_gender', old.gender");
    expect(migration).toContain("'new_gender', new.gender");
    expect(migration).toContain("'profile.gender_updated'");
    expect(migration).toContain("revoke all on function private.guard_and_audit_profile_gender_change() from public, anon, authenticated, service_role");
  });

  it("requires genuine Couple history for Admin edits, including ended memberships", () => {
    expect(migration).toContain("private.current_user_has_role(array['super_admin', 'admin']::public.app_role[])");
    expect(migration).toContain("couple.group_type = 'couple'");
    expect(migration).toContain("where membership.profile_id = new.id");
    expect(migration).toContain("if coalesce(cardinality(couple_group_ids), 0) = 0 then");
    expect(migration).toContain("Profile does not have Couple membership history");
    const adminLookup = migration.slice(migration.indexOf("elsif is_admin then"), migration.indexOf("elsif is_counselor then"));
    expect(adminLookup).not.toContain("membership.ended_at is null");
    expect(adminLookup).not.toContain("couple.active");
    expect(adminLookup).toContain("if cardinality(couple_group_ids) = 1 then");
    expect(adminLookup).toContain("selected_couple_group_id := couple_group_ids[1]");
    expect(migration).toContain("select distinct couple.id as group_id");
    expect(migration).not.toMatch(/order by (?:membership_history|history)\.(?:joined_at|ended_at|created_at)/i);
  });

  it("uses a verified RPC Couple target without spoofable session context", () => {
    expect(migration).toContain("create table private.profile_gender_change_context");
    expect(migration).toContain("primary key (transaction_id, profile_id)");
    expect(migration).toContain("revoke all on table private.profile_gender_change_context from public, anon, authenticated, service_role");
    expect(migration).toContain("context.transaction_id = txid_current()");
    expect(migration).toContain("context.profile_id = new.id");
    expect(migration).toContain("context.actor_id is not distinct from actor");
    expect(migration).toContain("target_profile_id, actor, target_couple_group_id");
    expect(migration).toContain("Gender update context does not match Couple membership");
    expect(migration).toContain("delete from private.profile_gender_change_context");
    expect(migration).not.toMatch(/set_config\s*\(|current_setting\s*\([^)]*gender/i);
  });

  it("uses exact RPC context for the authorized active Counselor-of-record Case", () => {
    expect(migration).toContain("private.current_user_has_role(array['counselor']::public.app_role[])");
    expect(migration).toContain("assignment.assignment_type = 'counselor'");
    expect(migration).toContain("assignment.ended_at is null");
    expect(migration).toContain("counselor_team.group_type = 'counselor_team'");
    expect(migration).toContain("counselor_team.active");
    expect(migration).toContain("counseling_case.status in ('active', 'pending_final')");
    expect(migration).toContain("counseling_case.closed_at is null");
    expect(migration).toContain("couple_membership.profile_id = new.id");
    expect(migration).toContain("couple_membership.ended_at is null");
    expect(migration).toContain("where counseling_case.couple_group_id = selected_couple_group_id");
    expect(migration).toContain("Counselor gender changes must use the authorized RPC");
    expect(migration).toContain("Not authorized to update profile gender");
  });

  it("keeps invitation gender transfer narrowly tied to the nested activation trigger", () => {
    expect(migration).toContain("pg_trigger_depth() > 1");
    expect(migration).toContain("old.gender is null");
    expect(migration).toContain("current_setting('role', true) = 'service_role'");
    expect(migration).toContain("actor = new.id");
    expect(migration).toContain("request.invited_group_id = couple.id");
    expect(migration).toContain("person.gender = new.gender");
    expect(migration).toContain("lower(person.email) = lower(profile.email)");
    expect(migration).not.toMatch(/set_config\s*\(|gender_audit_bypass|skip_gender_audit/i);
    expect(stageOne).toContain("after insert on public.group_members");
    expect(stageOne).toContain("and profile.gender is null");
  });

  it("recognizes only a self-owned Couple profile in the invitation activation stage", () => {
    expect(invitationFix).toContain("pg_trigger_depth() > 1");
    expect(invitationFix).toContain("actor = new.id");
    expect(invitationFix).toContain("activation_role.role = 'couple'");
    expect(invitationFix).toContain("activation_profile.status in ('password_required', 'onboarding')");
    expect(invitationFix).toContain("request.invited_group_id = couple.id");
    expect(invitationFix).toContain("person.gender = new.gender");
    expect(invitationFix).toContain("lower(person.email) = lower(profile.email)");
    expect(invitationFix).not.toMatch(/set_config\s*\(|gender_audit_bypass|skip_gender_audit/i);
    expect(invitationFix).toContain("security definer\nset search_path = ''");
  });

  it("omits an ambiguous singular Couple ID and preserves every membership ID", () => {
    expect(migration).toContain("array_agg(membership_history.group_id order by membership_history.group_id)");
    expect(migration).toContain("if cardinality(couple_group_ids) = 1 then");
    expect(migration).toContain("if selected_couple_group_id is not null then");
    expect(migration).toContain("jsonb_build_object('couple_group_id', selected_couple_group_id)");
    expect(migration).toContain("'couple_group_ids', coalesce(to_jsonb(couple_group_ids), '[]'::jsonb)");
    expect(migration).toContain("audit_details := audit_details ||");
  });

  it("keeps the RPC signature and authorization while delegating its single audit to the trigger", () => {
    expect(migration).toContain("create or replace function public.update_couple_partner_gender(");
    expect(migration).toContain("target_couple_group_id uuid,\n  target_profile_id uuid,\n  target_gender text");
    expect(migration).toContain("grant execute on function public.update_couple_partner_gender(uuid, uuid, text) to authenticated");
    expect(migration).toContain("Profile does not belong to this Couple");
    const rpcBody = migration.slice(migration.indexOf("create or replace function public.update_couple_partner_gender("));
    expect(rpcBody).not.toContain("insert into public.audit_events");
    expect(rpcBody).toContain("target_profile_id, actor, target_couple_group_id");
    expect(rpcBody).toContain("delete from private.profile_gender_change_context");
    expect(rpcBody).toContain("and (\n        is_admin\n        or (couple.active and membership.ended_at is null)\n      )");
  });

  it("does not alter profile grants, RLS policies, unrelated fields, or Stage 1 history", () => {
    expect(migration).not.toMatch(/create\s+policy|drop\s+policy|grant\s+.*public\.profiles|revoke\s+.*public\.profiles|alter\s+table\s+public\.profiles/i);
    expect(migration).not.toMatch(/update\s+public\.profiles\s+set\s+(?!gender\b)[a-z_]+\s*=/i);
    expect(migration).not.toContain("create_intake_request");
    expect(stageOne).toContain("create function public.update_couple_partner_gender(");
  });
});
