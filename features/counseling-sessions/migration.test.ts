import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261002100000_counseling_sessions_workspace.sql", "utf8");
const policyFix = readFileSync("supabase/migrations/20261002110000_fix_counseling_sessions_progress_policy.sql", "utf8");
const recursionFix = readFileSync("supabase/migrations/20261002120000_fix_homework_read_policy_recursion.sql", "utf8");
const coupleIdentity = readFileSync("supabase/migrations/20261007110000_counseling_workspace_couple_identity.sql", "utf8");
const coupleNamePrecedence = readFileSync("supabase/migrations/20261007130000_couple_custom_name_precedence.sql", "utf8");
const statusHistoryCorrection = readFileSync("supabase/migrations/20261008100000_fix_counseling_case_status_history.sql", "utf8");
const lifecycleFoundation = readFileSync("supabase/migrations/20261012100000_session_lifecycle_foundation.sql", "utf8");
const lifecycleGrants = readFileSync("supabase/migrations/20261012110000_session_lifecycle_rpc_grants.sql", "utf8");
const activationIdentifierFix = readFileSync("supabase/migrations/20261012120000_fix_first_session_activation_identifiers.sql", "utf8");
const phase2a = readFileSync("supabase/migrations/20261012130000_complete_case_session_schedule_next.sql", "utf8");
const phase2b = readFileSync("supabase/migrations/20261012140000_schedule_followup_case_session_meeting.sql", "utf8");
const phase2c = readFileSync("supabase/migrations/20261012150000_complete_program_close_case.sql", "utf8");
const explicitFinal = readFileSync("supabase/migrations/20261013110000_explicit_final_session.sql", "utf8");
const superAdminScheduling = readFileSync("supabase/migrations/20261013105000_super_admin_case_scheduling.sql", "utf8");
const optionalHomework = readFileSync("supabase/migrations/20261013120000_optional_session_homework.sql", "utf8");
const authoredSessionNumbering = readFileSync("supabase/migrations/20261014100000_canonical_authored_session_number.sql", "utf8");
const futureMeetingGuard = readFileSync("supabase/migrations/20261015120000_reject_past_counseling_meetings.sql", "utf8");
const initialMeetingActivation = readFileSync("supabase/migrations/20261015130000_initial_meeting_activates_case.sql", "utf8");
const progressionHomeworkIdentifierFix = readFileSync("supabase/migrations/20261015140000_fix_progression_homework_identifier.sql", "utf8");
const legacyHomeworkActivationIdentifierFix = readFileSync("supabase/migrations/20261015170000_fix_legacy_homework_activation_identifier.sql", "utf8");

describe("counseling Sessions migration", () => {
  it("keeps the revoked legacy Homework activation helper free of ambiguous identifiers", () => {
    expect(legacyHomeworkActivationIdentifierFix).toContain("selected_homework_id uuid");
    expect(legacyHomeworkActivationIdentifierFix).toContain("into selected_homework_id, selected_version_id");
    expect(legacyHomeworkActivationIdentifierFix).toContain("values (selected_homework_id, target_case_id, actor_id)");
    expect(legacyHomeworkActivationIdentifierFix).toContain("returning public.homework_assignments.id into assignment_id");
    expect(legacyHomeworkActivationIdentifierFix).not.toMatch(/^\s*homework_id uuid;/m);
    expect(legacyHomeworkActivationIdentifierFix).toContain("from public, anon, authenticated");
  });

  it("uses an unambiguous selected Homework identifier when progressing into a Session with Homework", () => {
    expect(progressionHomeworkIdentifierFix).toContain("selected_homework_id uuid");
    expect(progressionHomeworkIdentifierFix).toContain("select h.id, v.id into selected_homework_id, selected_version_id");
    expect(progressionHomeworkIdentifierFix).toContain("if selected_homework_id is not null then");
    expect(progressionHomeworkIdentifierFix).toContain("values(selected_homework_id, target_case_id, actor)");
    expect(progressionHomeworkIdentifierFix).not.toMatch(/^\s*homework_id uuid;/m);
  });

  it("preserves optional Homework, atomic progression, finality, authored numbering, gates, and authorization", () => {
    expect(progressionHomeworkIdentifierFix).toContain("exists (select 1 from public.homework_version_blocks b where b.homework_version_id = v.id)");
    expect(progressionHomeworkIdentifierFix).toContain("perform private.create_homework_progress(revision_id)");
    expect(progressionHomeworkIdentifierFix).toContain("case when revision_id is null then null else transition_at end");
    expect(explicitFinal).toContain("create trigger case_sessions_snapshot_finality");
    expect(explicitFinal).toContain("select s.is_final into new.is_final");
    expect(progressionHomeworkIdentifierFix).toContain("authored_session_number");
    expect(progressionHomeworkIdentifierFix).toContain("current_session.actual_sequence + 1");
    expect(progressionHomeworkIdentifierFix).toContain("count(*) filter (where p.status in ('submitted', 'reviewed'))");
    expect(progressionHomeworkIdentifierFix).toContain("override_confirmation is distinct from 'OVERRIDE'");
    expect(progressionHomeworkIdentifierFix).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(progressionHomeworkIdentifierFix).toContain("insert into public.case_session_meetings");
  });

  it("does not add notification writes or change the progression RPC signature and grants", () => {
    expect(progressionHomeworkIdentifierFix).toContain("public.complete_case_session_schedule_next(\n  target_case_session_id uuid,\n  target_session_id uuid,\n  target_starts_at timestamptz,\n  target_ends_at timestamptz,\n  override_confirmation text default null");
    expect(progressionHomeworkIdentifierFix).not.toMatch(/notification_deliveries|notification_events|send_email/i);
    expect(progressionHomeworkIdentifierFix).not.toMatch(/grant\s+execute|revoke\s+execute/i);
  });

  it("atomically activates a matched case when Session 0 is scheduled", () => {
    expect(initialMeetingActivation).toContain("create or replace function public.schedule_initial_case_meeting");
    expect(initialMeetingActivation).toContain("select counseling_case.status");
    expect(initialMeetingActivation).toContain("and counseling_case.closed_at is null");
    expect(initialMeetingActivation).toContain("for update");
    expect(initialMeetingActivation).toContain("if prior_status not in ('matched', 'active') then");
    expect(initialMeetingActivation).toContain("insert into public.case_session_meetings");
    expect(initialMeetingActivation).toContain("if prior_status = 'matched' then");
    expect(initialMeetingActivation).toContain("set status = 'active'");
    expect(initialMeetingActivation.indexOf("insert into public.case_session_meetings")).toBeLessThan(initialMeetingActivation.indexOf("set status = 'active'"));
  });

  it("keeps Session 0 rescheduling idempotent without reopening terminal cases or creating authored Sessions", () => {
    expect(initialMeetingActivation).toContain("select meeting.id");
    expect(initialMeetingActivation).toContain("set\n      starts_at = target_starts_at");
    expect(initialMeetingActivation).toContain("if prior_status = 'matched' then");
    expect(initialMeetingActivation).not.toMatch(/insert\s+into\s+public\.case_sessions/i);
    expect(initialMeetingActivation).not.toMatch(/insert\s+into\s+public\.case_status_history/i);
    expect(initialMeetingActivation).not.toMatch(/homework|material|notification/i);
  });

  it("preserves narrow care-team or Super Admin authorization for Session 0", () => {
    expect(initialMeetingActivation).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(initialMeetingActivation).toContain("private.current_user_has_role(array['super_admin']::public.app_role[])");
    expect(initialMeetingActivation).not.toContain("array['admin', 'super_admin']");
    expect(initialMeetingActivation).not.toMatch(/grant\s+execute/i);
  });

  it("rejects newly inserted or rescheduled past Meeting starts without constraining historical rows", () => {
    expect(futureMeetingGuard).toContain("create trigger case_session_meetings_future_start");
    expect(futureMeetingGuard).toContain("before insert or update of starts_at on public.case_session_meetings");
    expect(futureMeetingGuard).toContain("new.starts_at <= pg_catalog.clock_timestamp()");
    expect(futureMeetingGuard).toContain("Meeting date and time must be in the future.");
    expect(futureMeetingGuard).not.toMatch(/add\s+constraint/i);
    expect(futureMeetingGuard).not.toContain("update public.case_session_meetings");
  });

  it("keeps meeting lifecycle and progression in narrow RPCs", () => {
    expect(migration).toContain("create table public.case_session_meetings");
    expect(migration).toContain("create or replace function public.schedule_case_session_meeting");
    expect(migration).toContain("Complete the current Session Homework");
    expect(migration).toContain("create or replace function public.close_counseling_case");
    expect(migration).toContain("case_session_meetings_read_authorized");
  });

  it("records only real transitions to active using the case status captured before scheduling", () => {
    const functionBody = statusHistoryCorrection.slice(statusHistoryCorrection.indexOf("create or replace function public.schedule_case_session_meeting"));
    expect(functionBody).toContain("select status into prior_status from public.counseling_cases where id = target_case_id and closed_at is null for update");
    expect(functionBody.indexOf("select status into prior_status")).toBeLessThan(functionBody.indexOf("update public.counseling_cases set status"));
    expect(functionBody).toContain("if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then");
    expect(functionBody).toContain("values (target_case_id, prior_status, 'active', actor, 'Session meeting scheduled')");
    expect(functionBody).not.toContain("select id, status, 'active', actor, 'Session meeting scheduled' from public.counseling_cases");
  });

  it("preserves meeting updates, initial scheduling, sequence checks, homework activation, and the existing history reason", () => {
    expect(statusHistoryCorrection).toContain("where counseling_case_id = target_case_id and session_id is not distinct from target_session_id for update");
    expect(statusHistoryCorrection).toContain("if target_session_id is null then");
    expect(statusHistoryCorrection).toContain("Complete the current Session Homework before scheduling the next meeting");
    expect(statusHistoryCorrection).toContain("Meetings must be scheduled in Session order");
    expect(statusHistoryCorrection).toContain("perform private.activate_case_session_homework(target_case_id, target_session_id, actor)");
    expect(statusHistoryCorrection).toContain("Session meeting scheduled");
    expect(statusHistoryCorrection).not.toContain("close_counseling_case");
  });

  it("keeps care-team Homework progress access out of the revisions/progress RLS cycle", () => {
    expect(policyFix).toContain("current_user_can_manage_homework_assignment_revision");
    expect(policyFix).toContain("drop policy homework_progress_care_team_read");
    expect(policyFix).toContain("homework_progress_care_team_read");
  });

  it("keeps existing participant Homework reads out of the same RLS cycle", () => {
    expect(recursionFix).toContain("current_user_can_read_homework_assignment");
    expect(recursionFix).toContain("current_user_can_read_homework_assignment_revision");
    expect(recursionFix).toContain("drop policy homework_assignment_admin_read");
    expect(recursionFix).toContain("drop policy homework_revision_admin_read");
  });

  it("projects only active Couple names/photos for cases the caller can access", () => {
    expect(coupleIdentity).toContain("create or replace function public.get_counseling_workspace_couple_identity(target_case_id uuid)");
    expect(coupleIdentity).toContain("counseling_case.id = target_case_id");
    expect(coupleIdentity).toContain("private.current_user_can_access_case(counseling_case.id)");
    expect(coupleIdentity).toContain("membership.ended_at is null");
    expect(coupleIdentity).toContain("profile.first_name");
    expect(coupleIdentity).toContain("profile.last_name");
    expect(coupleIdentity).toContain("profile.photo_path");
    expect(coupleIdentity).not.toContain("profile.email");
    expect(coupleIdentity).not.toContain("profile.phone");
    expect(coupleIdentity).toContain("revoke all on function public.get_counseling_workspace_couple_identity(uuid) from public, anon, authenticated");
    expect(coupleIdentity).toContain("grant execute on function public.get_counseling_workspace_couple_identity(uuid) to authenticated");
  });

  it("adds only the Couple group display name to the existing case-scoped identity projection", () => {
    expect(coupleNamePrecedence).toContain("drop function public.get_counseling_workspace_couple_identity(uuid)");
    expect(coupleNamePrecedence).toContain("couple_group.name");
    expect(coupleNamePrecedence).toContain("private.current_user_can_access_case(counseling_case.id)");
    expect(coupleNamePrecedence).toContain("membership.ended_at is null");
    expect(coupleNamePrecedence).toContain("revoke all on function public.get_counseling_workspace_couple_identity(uuid) from public, anon, authenticated");
    expect(coupleNamePrecedence).toContain("grant execute on function public.get_counseling_workspace_couple_identity(uuid) to authenticated");
    expect(coupleNamePrecedence).not.toMatch(/create\s+policy|alter\s+table|grant\s+select/i);
  });

  it("separates Couple Sessions from Meetings and enforces one active Session", () => {
    expect(lifecycleFoundation).toContain("create table public.case_sessions");
    expect(lifecycleFoundation).toContain("create table public.case_session_material_blocks");
    expect(lifecycleFoundation).toContain("add column case_session_id uuid references public.case_sessions");
    expect(lifecycleFoundation).toContain("create unique index case_sessions_one_active_idx");
    expect(lifecycleFoundation).toContain("where status = 'active'");
  });

  it("coordinates Initial Meeting completion, case-specific order, Meeting creation, and release in one RPC", () => {
    const body = lifecycleFoundation.slice(lifecycleFoundation.indexOf("create or replace function public.activate_first_case_session"));
    expect(body).toContain("actual_sequence, template_sequence_number");
    expect(body).toContain("target_case_id, target_session_id, 1, session_row.sequence_number");
    expect(body).toContain("homework_assignment_revision_id, material_released_at, homework_released_at");
    expect(body).toContain("insert into public.case_session_material_blocks");
    expect(body).toContain("set completed_at = transition_at, completed_by = actor");
    expect(body).toContain("insert into public.case_session_meetings");
    expect(body).toContain("if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then");
    expect(body).not.toContain("Meetings must be scheduled in Session order");
    expect(activationIdentifierFix).toContain("selected_homework_id uuid");
    expect(activationIdentifierFix).toContain("selected_version_id uuid");
    expect(activationIdentifierFix).toContain("created_case_session_id uuid");
  });

  it("keeps initial scheduling idempotent and rescheduling isolated to meeting time", () => {
    expect(lifecycleFoundation).toContain("create or replace function public.schedule_initial_case_meeting");
    expect(lifecycleFoundation).toContain("select id into meeting_id from public.case_session_meetings");
    expect(lifecycleFoundation).toContain("set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor");
    expect(lifecycleFoundation).toContain("create or replace function public.reschedule_case_session_meeting");
    expect(lifecycleFoundation).toContain("where id = target_meeting_id and case_session_id is not null for update");
    expect(lifecycleFoundation).toContain("revoke execute on function public.schedule_case_session_meeting");
  });

  it("pins released Homework and Resource versions behind case-scoped reads", () => {
    expect(lifecycleFoundation).toContain("homework_assignment_revision_id uuid not null");
    expect(lifecycleFoundation).toContain("resource_version_id uuid");
    expect(lifecycleFoundation).toContain("case_session_material_resource_version_fk");
    expect(lifecycleFoundation).toContain("case_sessions_read_authorized");
    expect(lifecycleFoundation).toContain("case_session_material_read_authorized");
    expect(lifecycleFoundation).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(lifecycleGrants).toContain("from public, anon, authenticated");
    expect(lifecycleGrants).toContain("to authenticated");
  });

  it("gates completion on both partners and requires exact Admin override without editing Homework", () => {
    expect(phase2a).toContain("count(*) filter (where p.status in ('submitted', 'reviewed'))");
    expect(phase2a).toContain("total_partner_count <> 2");
    expect(phase2a).toContain("override_confirmation is distinct from 'OVERRIDE'");
    expect(phase2a).toContain("current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(phase2a).toContain("case_session.homework_override");
    expect(phase2a).not.toMatch(/update\s+public\.homework_participant_progress/i);
  });

  it("completes the current Meeting and Session atomically, increments actual order, releases both assets, and schedules the selected Session", () => {
    expect(phase2a).toContain("set completed_at = transition_at, completed_by = actor");
    expect(phase2a).toContain("set status = 'completed', completed_at = transition_at, completed_by = actor");
    expect(phase2a).toContain("current_session.actual_sequence + 1");
    expect(phase2a).toContain("material_released_at, homework_released_at");
    expect(phase2a).toContain("insert into public.case_session_material_blocks");
    expect(phase2a).toContain("insert into public.case_session_meetings");
    expect(lifecycleFoundation).toContain("create unique index case_sessions_one_active_idx");
    expect(phase2a).toContain("target_session_id and status = 'published'");
  });

  it("keeps progression RPC execution authenticated and case-scoped for care roles or Admin", () => {
    expect(phase2a).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(phase2a).toContain("is_admin and exists (select 1 from public.counseling_cases c where c.id = target_case_id)");
    expect(phase2a).toContain("from public, anon, authenticated");
    expect(phase2a).toContain("to authenticated");
  });

  it("allows only Super Admin to schedule any existing case while retaining case-scoped staff and denying Admin-only scheduling", () => {
    expect(superAdminScheduling.match(/private\.current_user_has_role\(array\['super_admin'\]::public\.app_role\[\]\)/g)).toHaveLength(4);
    expect(superAdminScheduling.match(/private\.current_user_can_manage_counseling_case\(target_case_id\)/g)).toHaveLength(4);
    expect(superAdminScheduling.match(/exists \(select 1 from public\.counseling_cases c where c\.id = target_case_id\)/g)).toHaveLength(4);
    expect(superAdminScheduling).toContain("if not (private.current_user_can_manage_counseling_case(target_case_id) or (private.current_user_has_role(array['super_admin']::public.app_role[]) and exists (select 1 from public.counseling_cases c where c.id = target_case_id))) then");
    expect(lifecycleGrants).toContain("grant execute on function public.schedule_initial_case_meeting(uuid, timestamptz, timestamptz),");
    expect(lifecycleGrants).toContain("to authenticated");
    expect(superAdminScheduling).not.toMatch(/grant\s+execute/i);
    expect(superAdminScheduling).not.toContain("array['admin', 'super_admin']");
  });

  it("schedules a follow-up under the active Couple Session and preserves Session, releases, progress, and case history", () => {
    const functionBody = phase2b.slice(phase2b.indexOf("create or replace function public.schedule_followup_case_session_meeting"), phase2b.indexOf("create or replace function public.reschedule_case_session_meeting"));
    expect(functionBody).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(functionBody).toContain("status = 'active'");
    expect(functionBody).toContain("set completed_at = transition_at, completed_by = actor");
    expect(functionBody).toContain("target_case_id, current_session.session_id, target_case_session_id");
    expect(lifecycleFoundation).toContain("drop index public.case_session_meetings_session_unique_idx");
    expect(lifecycleFoundation).toContain("create index case_session_meetings_case_session_starts_idx");
    expect(functionBody).not.toMatch(/insert\s+into\s+public\.case_sessions/i);
    expect(functionBody).not.toMatch(/update\s+public\.case_sessions/i);
    expect(functionBody).not.toMatch(/actual_sequence|material_released_at|homework_released_at|homework_participant_progress|case_status_history/i);
    expect(phase2b).toContain("revoke execute on function public.schedule_followup_case_session_meeting(uuid, timestamptz, timestamptz) from public, anon, authenticated");
    expect(phase2b).toContain("grant execute on function public.schedule_followup_case_session_meeting(uuid, timestamptz, timestamptz) to authenticated");
  });

  it("reschedules only the upcoming Meeting in place and keeps Phase 2A progression unchanged", () => {
    const rescheduleBody = phase2b.slice(phase2b.indexOf("create or replace function public.reschedule_case_session_meeting"));
    expect(rescheduleBody).toContain("couple_session.status = 'active'");
    expect(rescheduleBody).toContain("meeting.completed_at is null");
    expect(rescheduleBody).toContain("order by upcoming.created_at desc, upcoming.id desc limit 1");
    expect(rescheduleBody).toContain("set starts_at = target_starts_at, ends_at = target_ends_at, scheduled_by = actor");
    expect(rescheduleBody).not.toMatch(/insert\s+into\s+public\.case_session_meetings/i);
    expect(phase2b).not.toContain("create or replace function public.complete_case_session_schedule_next");
    expect(phase2a).toContain("create or replace function public.complete_case_session_schedule_next");
  });

  it("completes the program atomically with the existing Homework gate and no progression", () => {
    const body = phase2c.slice(phase2c.indexOf("create or replace function public.complete_counseling_program"), phase2c.indexOf("create or replace function public.close_counseling_case_incomplete"));
    expect(body).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(body).toContain("current_user_has_role(array['admin', 'super_admin']::public.app_role[])");
    expect(body).toContain("override_confirmation is distinct from 'OVERRIDE'");
    expect(body).toContain("count(*) filter (where p.status in ('submitted', 'reviewed'))");
    expect(body).toContain("set status = 'completed', completed_at = transition_at, completed_by = actor");
    expect(body).toContain("set status = 'finished', closed_at = transition_at");
    expect(body).toContain("values (target_case_id, prior_status, 'finished', actor, 'Counseling program completed')");
    expect(body).not.toMatch(/insert\s+into\s+public\.case_sessions/i);
    expect(body).not.toMatch(/insert\s+into\s+public\.case_session_meetings/i);
    expect(body).not.toMatch(/update\s+public\.homework_participant_progress/i);
    expect(body).toContain("case_session.homework_override");
    expect(phase2c).toContain("revoke execute on function public.complete_counseling_program(uuid, text) from public, anon, authenticated");
    expect(phase2c).toContain("grant execute on function public.complete_counseling_program(uuid, text) to authenticated");
  });

  it("requires explicit assigned final-session metadata for terminal program completion", () => {
    expect(explicitFinal).toContain("add column is_final boolean not null default false");
    expect(explicitFinal).toContain("before insert on public.case_sessions");
    expect(explicitFinal).toContain("Assigned Session finality is immutable");
    expect(explicitFinal).toContain("if not current_session.is_final then");
    expect(explicitFinal).toContain("Only an explicitly designated Final Session can complete the counseling program");
    expect(explicitFinal).toContain("private.current_user_has_role(array['super_admin','admin','author']::public.app_role[])");
    expect(explicitFinal).toContain("target_is_final boolean");
    expect(explicitFinal).toContain("grant execute on function public.save_session_homework_authoring_state(uuid,text,jsonb,boolean,uuid,jsonb,boolean,boolean,text,boolean) to authenticated");
    expect(explicitFinal).toContain("Both partners must submit Homework");
    expect(explicitFinal).toContain("override_confirmation is distinct from 'OVERRIDE'");
  });

  it("releases Material without synthesizing Homework assignments when a published Session has no Homework", () => {
    expect(optionalHomework).toContain("alter column homework_assignment_revision_id drop not null");
    expect(optionalHomework).toContain("alter column homework_released_at drop not null");
    expect(optionalHomework).toContain("homework_assignment_revision_id is null and homework_released_at is null");
    expect(optionalHomework).toContain("and exists (select 1 from public.homework_version_blocks b where b.homework_version_id = v.id)");
    expect(optionalHomework).toContain("if selected_homework_id is not null then");
    expect(optionalHomework).toContain("if homework_id is not null then");
    expect(optionalHomework).toContain("revision_id, transition_at, case when revision_id is null then null else transition_at end, transition_at, actor");
    expect(optionalHomework).toContain("elsif publish_homework and target_homework_version_id is not null then");
    expect(optionalHomework).not.toContain("This Session needs published Homework before it can be scheduled");
  });

  it("keeps the Homework gate and exact override only when the current Session has an assigned Homework revision", () => {
    expect(optionalHomework).toContain("if not current_session.is_final then");
    expect(optionalHomework).toContain("Only an explicitly designated Final Session can complete the counseling program");
    expect(optionalHomework).toContain("if current_revision_id is not null then");
    expect(optionalHomework).toContain("if current_session.homework_assignment_revision_id is not null then");
    expect(optionalHomework).toContain("override_confirmation is distinct from 'OVERRIDE'");
    expect(optionalHomework).toContain("elsif override_confirmation is not null then");
    expect(optionalHomework).toContain("private.current_user_can_manage_counseling_case(target_case_id)");
    expect(optionalHomework).toContain("is_admin and exists (select 1 from public.counseling_cases c where c.id = target_case_id)");
    expect(optionalHomework).toContain("set search_path = ''");
  });

  it("snapshots authored rank across all templates before applying published eligibility", () => {
    expect(authoredSessionNumbering).toContain("create or replace function public.activate_first_case_session");
    expect(authoredSessionNumbering).toContain("create or replace function public.complete_case_session_schedule_next");
    expect(authoredSessionNumbering.match(/row_number\(\) over \(order by s\.sequence_number\)/g)).toHaveLength(2);
    expect(authoredSessionNumbering.match(/from public\.sessions s/g)).toHaveLength(2);
    expect(authoredSessionNumbering.match(/where ranked\.id = target_session_id and ranked\.status = 'published'/g)).toHaveLength(2);
    expect(authoredSessionNumbering.match(/where id = target_session_id and status = 'published' for share/g)).toHaveLength(2);
    expect(authoredSessionNumbering).toContain("target_case_id, target_session_id, 1, authored_session_number, session_row.title");
    expect(authoredSessionNumbering).toContain("authored_session_number, next_session.title, revision_id");
    expect(authoredSessionNumbering).not.toContain("session_row.sequence_number");
    expect(authoredSessionNumbering).not.toContain("next_session.sequence_number");
    expect(authoredSessionNumbering).toContain("current_session.actual_sequence + 1");
    expect(authoredSessionNumbering).toContain("override_confirmation is distinct from 'OVERRIDE'");
    expect(authoredSessionNumbering).toContain("next_session.title");
  });

  it("keeps first authored Session activation compatible with a case already active after Session 0", () => {
    const body = authoredSessionNumbering.slice(
      authoredSessionNumbering.indexOf("create or replace function public.activate_first_case_session"),
      authoredSessionNumbering.indexOf("create or replace function public.complete_case_session_schedule_next"),
    );
    expect(body).toContain("select status into prior_status from public.counseling_cases");
    expect(body).toContain("set status = case when status in ('requested', 'assessment', 'interviewed', 'matched') then 'active' else status end");
    expect(body).toContain("if prior_status in ('requested', 'assessment', 'interviewed', 'matched') then");
    expect(body).not.toContain("if prior_status <> 'matched'");
  });

  it("closes incomplete cases with a required care-team reason and preserves history", () => {
    const body = phase2c.slice(phase2c.indexOf("create or replace function public.close_counseling_case_incomplete"), phase2c.indexOf("revoke execute on function public.complete_counseling_program"));
    expect(body).toContain("if normalized_reason is null then");
    expect(body).toContain("if not is_admin then raise exception 'Select a reason for closing this counseling case'");
    expect(body).toContain("'Couple withdrew', 'Unable to contact couple', 'Couple relocated'");
    expect(body).toContain("'Referred elsewhere', 'Counseling relationship ended', 'Other'");
    expect(body).toContain("normalized_reason = 'Other' and normalized_notes is null");
    expect(body).toContain("set status = 'inactive', closed_at = transition_at");
    expect(body).toContain("values (target_case_id, prior_status, 'inactive', actor, history_reason)");
    expect(body).toContain("set completed_at = transition_at, completed_by = actor");
    expect(body).not.toMatch(/delete\s+from\s+public\.(case_sessions|case_session_meetings|case_session_material_blocks|homework_participant_progress)/i);
    expect(phase2c).toContain("drop function public.close_counseling_case(uuid)");
    expect(phase2c).toContain("revoke execute on function public.close_counseling_case_incomplete(uuid, text, text) from public, anon, authenticated");
    expect(phase2c).toContain("grant execute on function public.close_counseling_case_incomplete(uuid, text, text) to authenticated");
  });
});
