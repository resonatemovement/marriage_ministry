Project State Document — Resonate Marriage Ministry
Last updated: October 16, 2026
Current working branch: main
Repository: resonatemovement/marriage_ministry
Current base: `af9921d` (`feat: schedule meeting reminders with Supabase Cron`)
Current state: Phase 3A–3B lifecycle notifications and reminders are implemented. Phase 3C has dedicated disposable DEV Couple fixtures for normal lifecycle and Final Session verification. Participant Homework now uses one assignment-level form with one Save Draft action and one separate Submit Homework action; both routes share it, and one authenticated atomic RPC owns batch save and save-plus-submit. The published DEV Session `testing` (sequence 1) has published Homework version 1 containing Rich Text and Long Answer blocks. It is explicitly non-final, as is its existing assigned snapshot. Session `new session` is published and explicitly Final; new assignments snapshot that designation. Local `DEV_EMAIL_TEST_MODE=true`, exact DEV project guard, and `RESEND_WEBHOOK_SECRET` are configured. Safari confirmed the native time control could display `03:00 PM` without emitting `input`/`change` or setting its DOM value. Lifecycle scheduling uses a shared shadCN Input + Select control with editable `hh:mm`, separate AM/PM, live digit-only formatting as input is typed, PM default for new scheduling, saved-period preservation for rescheduling, submit-only time validation, and canonical `HH:mm` action values. Scheduling sheets use concise helper copy. Scheduling and rescheduling now reject dates before the current `America/Los_Angeles` date and reject today's times at or before the current instant; the optional DatePicker minimum is applied only to lifecycle scheduling, while manual MM/DD/YYYY entry remains supported. The server action converts canonical `HH:mm` to an instant using explicit Los Angeles timezone rules, and a database execution-time trigger rejects past starts on Meeting inserts or reschedules. Source CSS provides pointer cursor for enabled native buttons and not-allowed for disabled buttons in `app/globals.css`; however, the reported Safari button cursor mismatch is unresolved because live computed-style inspection was blocked by Safari’s Apple Events JavaScript setting. The split-button primary action and arrow trigger carry direct `cursor-pointer` classes with `disabled:cursor-not-allowed` fallbacks; Safari runtime confirmation remains pending. No shared Button component exists. Meeting Invite and Counseling Case Meeting timestamps now use a shared deterministic `formatToParts()` formatter in explicit `America/Los_Angeles` time, rendering invite timestamps as `Oct 13 at 9:17 AM`; browser hydration retest is pending. Shared DropdownMenuItem supplies pointer cursor, warm-neutral hover and Radix keyboard-highlight/focus-visible surfaces; disabled items retain not-allowed treatment without interactive hover, while destructive items retain danger text and subtle danger surfaces. Separators and labels remain non-interactive. A source audit found no always-mounted page-sized pointer overlay; runtime `elementFromPoint()`/`elementsFromPoint()` could not be run because Safari Apple Events JavaScript is disabled, so the pointer-hit cause remains unconfirmed. Counseling Case main Session card is the authoritative work area for Session details, Upcoming Meeting, Homework, and Meeting Invites; an active authored Session is labeled Current while only its scheduled Meeting is Upcoming. The separate Current Session, Current Homework, and Next Meeting cards were removed. Homework and Meeting Invites headings use `text-brand-secondary`; a balanced 24px gap above and below the divider centers it between the Homework content and Meeting Invites heading; the heading-to-first-row gap remains unchanged. Right-rail order is Counseling Status, Prepare & Enrich, Next Step, Next Meeting, Progress. The rail Progress card keeps the `Session X of Y` current-position label and the existing horizontal bar calculation/presentation; this position indicator does not establish program completion. The initial Session 0 action now reads `Schedule Initial Meeting`, uses a standalone full-width rounded button, and centers its label horizontally and vertically while no Initial Meeting is scheduled; after scheduling, the existing `Schedule Next Session` split action retains its prior text alignment. Normal authored Sessions retain `Schedule Next Session`, while only a snapshot explicitly designated final shows `Complete Program`. For a normal authored Session with zero eligible published next Sessions, the progression sheet retains Homework Status, shows the explicit Next Session blocker, hides the empty selector, meeting date/time fields, and completion action, and guards submit; once a published next Session is available, the existing normal scheduling flow is unchanged. The explicit final-Session Complete Program flow remains separate. Contextual secondary actions remain wired to the existing reschedule, follow-up, individual resend, and close actions. Main-content Meeting invites are compact first-name rows with newest status/event time and a Sheet for all recorded attempts; resend actions now live once per eligible partner in the Next Step menu and still use the current Meeting and newest eligible partner delivery. Couple Workspace displays the upcoming Meeting's stored location once (for example, `date · In person`); it continues to use the latest uncompleted Meeting. DEV migration `20261013110000_explicit_final_session.sql` adds non-final-by-default template metadata, immutable assignment snapshots, and a server-side Complete Program finality check while preserving Homework/override behavior. Supabase types were regenerated from linked DEV. Temporary diagnostics were removed. Phase 3C browser retest remains pending. The prior `JWT issued at future` failure is not reproducible: the configured opaque DEV `SUPABASE_SECRET_KEY` currently succeeds against Auth Admin and read-only PostgREST; the Mac clock is synchronized within about 1 ms of `time.apple.com`. The full worktree remains uncommitted and unpushed on `main`; PROD was not inspected or accessed.

Current closeout status: Phase 3C — Couple Session Assignment & Delivery is complete and user browser-verified through successful program completion, historical Material/Homework review, and the completed-Session breadcrumb flow. Linked DEV migrations align through `20261015170000_fix_legacy_homework_activation_identifier.sql`; generated Supabase types match linked DEV. The validated milestone is being closed on `main`; the next milestone is Phase 3D — Live Updates. The detailed closeout record below supersedes earlier Phase 3C entries that say browser verification or milestone validation was pending.

Current deployment status: commit `af9921d` is pushed to `origin/main` and deployed successfully to the Git-linked `marriage-ministry-dev` Vercel project. Vercel no longer owns the hourly Meeting reminder schedule; its unrelated daily keep-alive remains. Forward migration `20261016100000_schedule_meeting_reminders.sql` is the only pending linked DEV migration and is intentionally unapplied because none of the five local `CRON_SECRET` definitions authenticates against the deployed DEV endpoint. Supabase Vault remains empty and `pg_cron`/`pg_net` remain disabled, so no Supabase reminder scheduler is active yet. The exact blocker is access to the deployed DEV `CRON_SECRET` or authorization to set it to a known local secret; after that, verify the authorized endpoint, provision the endpoint URL and bearer value in DEV Vault, apply the migration, and verify the hourly job. PROD was not accessed or deployed.

October 16, 2026 — Supabase Cron reminder scheduler deployment blocker
- Audited the Phase 3 reminder path. Vercel previously targeted authenticated `GET /api/cron/meeting-reminders` hourly. The route requires exact `Authorization: Bearer <CRON_SECRET>` and delegates to the existing server-only reminder processor. That processor scans only future open Meetings inside 72 hours, applies the unchanged 72-hour Homework and 24-hour Meeting rules, resolves the existing two Couple recipients, and uses the existing Resend delivery implementation and templates. Its delivery key includes Meeting ID, reminder type, current start time, and partner profile; the partial unique index on `notification_deliveries.delivery_key` is claimed before sending, so repeated or overlapping invocations cannot send the same reminder twice.
- Added forward migration `20261016100000_schedule_meeting_reminders.sql`. It enables Supabase-supported `pg_cron` and `pg_net`, refuses to schedule unless named Vault entries `meeting_reminder_endpoint_url` and `meeting_reminder_cron_secret` exist and are non-empty, removes any same-name job, and schedules one `meeting-reminders-hourly` job at `0 * * * *`. The job performs an authenticated `net.http_get` to the Vault-held endpoint. No endpoint, bearer credential, Resend secret, or project credential is embedded in source or migration.
- Removed `/api/cron/meeting-reminders` from `vercel.json`; the daily `/api/cron/keep-alive` entry remains. Commit `af9921d` deployed successfully through GitHub only to Vercel project `resonate-movement/marriage-ministry-dev`, clearing the Hobby hourly-Cron rejection. The deployed route returns 401 without authorization. A read-only DEV query found zero current reminder candidates and zero possible due 24-hour or 72-hour reminders, so an authorized probe would not send mail.
- Activation is deliberately blocked before Vault provisioning or migration apply: `.env.local` contains five ignored `CRON_SECRET` definitions, and each was tested by position without logging its value; all five received 401 from the deployed DEV endpoint. The Vercel CLI is logged out, so the deployed secret cannot be read or updated safely from this environment. Linked DEV currently has only `supabase_vault` installed, zero Vault entries, and no `cron.job` relation. Local and linked migration history align through `20261015170000`; `20261016100000` is the only pending DEV migration. There is currently no active reminder scheduler in Vercel or Supabase.
- Focused reminder/authentication validation passed 17 tests across four files. `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` passed. The deployed DEV endpoint's unauthorized behavior was verified live. Authorized live invocation, Vault provisioning, migration apply, hourly job execution, and duplicate live invocation remain pending on the credential blocker. No lifecycle record was modified, no reminder email was sent, and PROD was not accessed.
- Exact unblock step: in the `marriage-ministry-dev` Vercel project, set `CRON_SECRET` to one chosen current local DEV value (or securely provide/synchronize the existing deployed value), redeploy DEV, and verify the bearer request returns 200. Then create the two named Vault secrets in linked DEV, apply only `20261016100000`, confirm one active `meeting-reminders-hourly` job at `0 * * * *`, inspect its first authenticated HTTP response, and complete the Phase 3C scheduler closeout before starting Phase 3D Live Updates.

October 15, 2026 — Phase 3C Couple Session Assignment & Delivery closeout
- Completed scope: Session 0 scheduling/rescheduling and activation; authored Session assignment with pinned authored number, Material/Resource snapshots, optional pinned Homework, immutable explicit-final metadata, and one-active-Session enforcement; Homework draft/save/submit and partner isolation; atomic gated progression, Admin/Super Admin exact `OVERRIDE`, follow-up Meetings, incomplete closure, final program completion, meeting invitations/resends/webhooks, reminders, and DEV-only reset. Finality is never inferred from list position. Completed cases are terminal under normal lifecycle RPCs.
- Couple delivery: active Couples retain Current Session, Homework, upcoming Meeting, position-based Progress, and the dedicated Session reader. Completed Couples receive the congratulations/review path, journey-ordered historical Sessions using pinned authored numbers, released Material, read-only submitted Homework, and `Workspace / Sessions / Session N` breadcrumbs. The user reports browser verification through successful completion and historical review, including the final breadcrumb correction.
- Homework persistence: both participant routes share one assignment-level controlled form. Save Draft atomically persists partial answers; Submit atomically persists current answers, validates every pinned Long Answer, and marks the caller submitted. Submitted/Reviewed work is read-only. No-Homework Sessions remain valid. RLS and the persistence RPC keep each partner limited to their own progress and answers.
- Security verification: the full security/lifecycle regression suite passed. Read-only DEV checks confirmed each completed fixture partner can see both of their assigned historical Sessions while seeing only their own two progress rows and two answer rows; the other disposable Couple sees zero Sessions from the completed case; anonymous Session access is denied. The completed fixture `754e4d58-a378-4477-ac06-f93e6b878bc0` remains `finished` with two completed Sessions, Session 2 explicitly final, and four submitted partner progress rows. No fixture lifecycle data was changed during closeout.
- Database closeout found one real schema-lint error in the revoked legacy scheduling helper: its PL/pgSQL `homework_id` variable collided with the `homework_assignments.homework_id` conflict target. Added and applied DEV-only forward migration `20261015170000_fix_legacy_homework_activation_identifier.sql`, replacing only that private helper with qualified columns/unambiguous locals and retaining its private/anon/authenticated revokes. Post-apply schema lint has no errors; remaining warnings predate this correction. Local and linked DEV histories align with no pending migration. Generated types match linked DEV and did not change for the private helper replacement. PROD was not accessed or changed.
- Full validation: `npm test` passed 748 tests across 126 files; `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:supabase`, and `git diff --check` passed. Knip was run and remains nonzero on the established repository baseline: two unused files, unlisted `sharp` / `@tiptap/core`, 16 unused exports, and 10 unused exported types. Closeout removed 12 unnecessary Phase 3C export modifiers proven file-local. Full migration drift reconstruction could not run because Docker/Podman is not installed; migration history, generated-type comparison, schema lint, and linked DEV connectivity all passed.
- Code-quality audit found no temporary Safari diagnostics, debug logging, committed environment file, or common credential/token pattern in the milestone diff or untracked files. `.env.local` remains ignored. Three stale tests were aligned with the approved standalone Initial Meeting button/direct split-button cursor classes and current server-only route imports; no product behavior changed.
- Known follow-ups: Phase 3D realtime synchronization; broader production email/reminder operations and real-recipient verification; the existing Knip baseline; and any remaining non-blocking Safari computed-cursor/hit-testing review. No unresolved Session Material encoding defect is currently documented. Safe-sink Resend verification remains distinct from real-recipient delivery.
- Git/deployment gate: branch is `main`. Historical GitHub statuses show pushes to `main` deploy the Vercel project `marriage-ministry-dev`; no GitHub deployment or check evidence points to a PROD project. The closeout commit includes this state record; its final hash and push result are recorded in the handoff and Git history. PROD was not accessed or intentionally deployed.
- Post-push result: `351f681` reached `origin/main`. Its `marriage-ministry-dev` Vercel status failed with the provider's Cron usage/pricing link because the DEV Hobby plan permits Cron Jobs only once per day and the approved meeting-reminder schedule is hourly. This is an environment/plan blocker; no code fallback changed reminder semantics, and PROD was untouched.
- Exact Phase 3D starting point: add privacy-preserving live synchronization for active counseling case, Session, Meeting, Homework-status, and notification-status surfaces, keeping current server authorization/RLS and snapshot/versioning contracts authoritative.

October 15, 2026 — Phase 3C completed Couple Workspace and Session review
- A Couple whose authoritative case status is `finished` now sees one large congratulations card beneath the unchanged Couple identity header. It replaces the Current Session, Homework, Next Meeting, and Counseling Progress cards and links to `Review Session Material`. The two-column shell and right rail remain Counseling Status, Counseling Team, and Prepare & Enrich. Active/matched Couples retain the existing four-card overview; `inactive` / Closed — Incomplete does not use the completed presentation. Completion is now derived specifically from `status = finished`, rather than any non-null `closed_at`.
- Added completed-only `/workspace/sessions` as the smallest review index. It lists only `case_sessions` assigned to the authenticated Couple's completed case, ordered by `actual_sequence`, and displays pinned `template_sequence_number`, pinned title, stored status, and a link to the existing `/workspace/sessions/[caseSessionId]` reader. No Builder templates or live Builder Material are queried. The existing reader continues to use `case_session_material_blocks`, pinned Resource Version IDs, the assigned Homework revision, and the signed-in partner's own progress/answers; completed Sessions pass `readOnly` and render no Save Draft or Submit Homework actions.
- Historical Session pages use `Workspace / Sessions / Session N`; Workspace links to `/workspace`, Sessions links to `/workspace/sessions`, and the current Session crumb is plain text labeled with the pinned authored number. This crumb appears only when the underlying case status is `finished`, so active and Closed — Incomplete Couples retain the existing `Workspace / Session N` hierarchy. Breadcrumb links reuse the shared shadCN BreadcrumbLink styling and both tabs render the same hierarchy.
- Added forward migration `20261015160000_completed_couple_homework_history.sql`. The old Homework block read policy depended on the open/current-case helper and hid pinned Homework content after program completion. Its replacement permits authenticated Couple reads only when the caller has their own progress row for the exact revision pinned to an active/completed `case_session` in a case they can access. Homework-answer RLS remains owner-only, and no insert/update/delete grant was added. Existing case-session/Material/Resource snapshot RLS already supported completed cases and was unchanged.
- Files added: `app/workspace/sessions/page.tsx`, `features/couple-workspace/session-review.tsx`, review/query/migration focused tests, and `supabase/migrations/20261015160000_completed_couple_homework_history.sql`. Files modified: `features/couple-workspace/workspace.tsx`, `features/couple-workspace/queries.ts`, their focused tests, Session View tests, and this document. No generated type change was required because the new helper is private and no public schema signature changed.
- Linked DEV history matched through `20261015150000` with only the new migration pending. Applied `20261015160000` to DEV `lctkqjjkhpyootwvttvj`; PROD was not inspected or accessed. Read-only DEV verification against completed case `754e4d58-a378-4477-ac06-f93e6b878bc0` confirmed two completed assigned Sessions in actual journey order, released Material visibility, all five pinned Homework blocks, and both partners' submitted state. Each partner saw exactly their own two response rows and zero rows belonging to the other partner; a case Session from the other DEV Couple was denied; authenticated direct answer updates remain ungranted. No case, Session, Homework, Meeting, notification, or email record was mutated.
- Focused Couple Workspace, Session review, Session View, Homework, migration, privacy/query, and lifecycle-control validation passed: 70 tests across 9 files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed; linked DEV migration dry-run reports up to date. No full suite/build/knip was run. Branch `main`; existing dirty worktree remains uncommitted and unpushed.
- Historical breadcrumb regression coverage then passed with Couple Workspace/query, Session review/query, and Session View tests (44 tests across 6 files); `npm run typecheck` and `npm run lint` passed. This presentation-only change required no migration, DEV data change, or generated-type update. `git diff --check` passed after the breadcrumb update. Browser verification remains pending.
- Exact browser verification: sign in as each Final Session fixture partner and open `/workspace`; confirm the unchanged header/right rail and single congratulations card, with none of the four active overview cards. Open `Review Session Material`; confirm Session 1 `testing` then Session 2 `new session`, both Completed. Open each Session and verify Material pagination/resources use released content, Homework shows only that partner's submitted answer with a green Submitted badge and no save/submit actions, then confirm browser access to the other Couple's known case Session URL returns not found. Also confirm an active fixture retains its existing four overview cards and Closed — Incomplete does not show congratulations.
- Confirm the completed Session pages show `Workspace / Sessions / Session 1` and `Workspace / Sessions / Session 2` on both tabs; Sessions returns to the review list, Workspace returns to the Couple Workspace, and the current Session crumb is not clickable. Active and Closed — Incomplete Session pages should continue showing `Workspace / Session N`.

October 15, 2026 — Phase 3C assignment-level participant Homework saving
- Replaced each Long Answer's individual `Save response` form with one shared assignment form. All Long Answer controls keep a single controlled answer map initialized from persisted responses. One secondary `Save Draft` and one primary `Submit Homework` action render together at the bottom in both `/workspace/sessions/[caseSessionId]` and `/workspace/homework`; Rich Text remains read-only, submitted/reviewed assignments remain read-only, and no-Homework snapshots render no actions.
- Added authenticated RPC `persist_participant_homework(uuid,jsonb,text)` in forward migration `20261015150000_assignment_level_homework_persistence.sql`. It locks only the caller's active participant progress, validates every payload key against the exact pinned Homework Version before writing, rejects submitted/reviewed progress, and upserts all supplied answers under the existing uniqueness constraint. Draft saves may remain partial and advance Not Started to In Progress only when a meaningful answer exists. Submit persists current unsaved answers and validates every pinned Long Answer before marking Submitted in the same database transaction; validation or persistence failure rolls back the complete operation.
- Required submission errors render beside the unanswered question and preserve all typed values. Success copy is `Draft saved` or `Homework submitted successfully`; successful persistence resets dirty state and updates the displayed partner status. Dirty answers warn on Session Material tab changes, ordinary internal-link navigation, and browser refresh/close. No warning remains after successful save/submit.
- Linked DEV history matched local through `20261015140000`, with only `20261015150000_assignment_level_homework_persistence.sql` pending. Applied that migration to DEV project `lctkqjjkhpyootwvttvj` only and regenerated `types/database.generated.ts`. Rollback-only DEV checks proved whole-payload validation, partial save, duplicate-free resave, failed-submit rollback, atomic unsaved-answer submission, and cross-partner denial. At that verification point Partner One was Submitted and Partner Two remained Not Started; the later browser run submitted Partner Two and completed the program. The current completed fixture state is recorded in the newer completed Workspace entry above. PROD was not inspected or accessed.
- Focused participant renderer, server action, migration, reminder, Session View, participant-query, Homework foundation, and lifecycle-control validation passed (78 tests across 9 files). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Linked DEV migration dry-run reports up to date. No full suite/build/knip was run. Branch `main`; the existing dirty worktree remains uncommitted and unpushed.
- Assignment-level browser verification progressed the fixture through both partners' submitted Homework and program completion. The exact remaining browser review is recorded in the newer completed Workspace entry above.

October 15, 2026 — Phase 3C Session 0 primary action presentation
- In the Counseling Case Next Step card, an unscheduled Session 0 now labels its primary action `Schedule Initial Meeting`. It uses the existing primary button styling, fills the card width, has rounded corners on all sides, and centers the label horizontally and vertically; it has no dropdown trigger because no secondary action applies in this state. The existing click still opens the `schedule-initial` flow.
- After the Initial Meeting exists, the primary action remains `Schedule Next Session` and the existing context-aware split-button/menu behavior is preserved. Authored Session, final Session, scheduling, authorization, lifecycle transitions, and notifications are unchanged.
- Focused lifecycle-control tests, `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD data change. Browser verification remains pending. Branch `main`; existing dirty worktree retained, with no commit or push.
- Exact next step: in the browser, open an unscheduled Session 0 case and confirm the full-width `Schedule Initial Meeting` button opens the existing form; then confirm the scheduled Session 0 split-button still offers its existing secondary actions.

October 15, 2026 — Phase 3C future-only Meeting scheduling
- Scheduling and rescheduling now reject complete local Meeting instants at or before the current time in `America/Los_Angeles`. Past calendar days are disabled in the shared DatePicker only when a scheduling flow passes its optional `minDate`; unrelated date pickers retain their historical-date behavior. Manual `MM/DD/YYYY` entry remains supported. Date and time errors appear inline on blur/submit, and input state remains controlled when validation fails.
- The shared validator checks strict calendar dates, the Los Angeles current date, canonical time, DST-invalid local wall times, and the full instant. `SessionLifecycleControls` uses that same validation for Initial Meeting scheduling, Initial Meeting completion/first Session activation, next Session progression, follow-up scheduling, and both reschedule modes. The server action converts canonical `HH:mm` using explicit Los Angeles timezone rules before calling the existing RPCs. Database migration `20261015120000_reject_past_counseling_meetings.sql` adds a `BEFORE INSERT OR UPDATE OF starts_at` trigger comparing against `clock_timestamp()` at write execution; it rejects past writes without a historical-time constraint or RPC signature/permission changes. All lifecycle mutation and notification dispatch remains behind successful validation/RPC completion.
- Before apply, linked DEV ref was confirmed as `lctkqjjkhpyootwvttvj`; local and remote migration histories matched through `20261014100000`, with this migration as the only pending local migration. Applied only to linked DEV. Post-apply migration history matches through `20261015120000`, and a linked dry run reports up to date. No generated type change was needed because only a private trigger function/trigger was added. No Couple lifecycle action or email was triggered; PROD was not accessed.
- Focused validation passed: 58 tests across scheduling validation, DatePicker, lifecycle controls, and migration coverage; `npm run typecheck`; `npm run lint`; and `git diff --check`. A direct linked SQL behavior probe was unavailable because the Management API query endpoint rejected the configured CLI token format; the migration itself applied successfully and recorded cleanly. No live RPC behavior check or browser verification was performed.
- Exact next step: in the DEV browser, open each of the five scheduling/rescheduling contexts without submitting a valid lifecycle action. Confirm calendar dates before today are disabled, today/future dates are selectable, manual past dates show `Meeting date cannot be in the past.`, a past time today shows `Meeting time must be in the future.`, and tomorrow accepts a future time. Then verify a deliberately past direct RPC request is rejected without changing case/Session/Meeting state, using a disposable controlled transaction or a separate fixture.

October 15, 2026 — Phase 3C Final Session lifecycle disposable DEV fixture
- Created a second, isolated DEV-only fixture for manual Final Session lifecycle verification. Couple group `Phase 3C Final Session DEV Couple` has ID `5d5bdf2d-ed86-4047-a068-22c3f3f38087`; its new Counseling Case is `754e4d58-a378-4477-ac06-f93e6b878bc0`, in canonical `matched` state with `closed_at = null`. Browser entry point: `/workspace/cases/754e4d58-a378-4477-ac06-f93e6b878bc0`.
- Partner One Auth/profile ID `8a1a3d4e-fc06-4669-8816-29c428bce644`, login `phase3c-final-20261015-dd1e04bc-one@mailinator.com`; Partner Two Auth/profile ID `de62cef7-a103-4eb4-af86-8a683594b9fd`, login `phase3c-final-20261015-dd1e04bc-two@mailinator.com`. Each email has exactly one confirmed, usable DEV Auth identity, an active same-ID profile with completed onboarding, the `couple` role, and one active membership in the new Couple. Both credentials passed direct linked-DEV sign-in. Passwords exist only in local `.env.local` as `PHASE3C_FINAL_PARTNER_1_PASSWORD` and `PHASE3C_FINAL_PARTNER_2_PASSWORD`; fixture emails use the corresponding `*_EMAIL` variables. Existing Phase 3C credentials were not overwritten, and no password/token is documented here.
- Reused Fremont / `DEV_TEST` campus `7695d7ab-0dc1-49a6-a8bf-3ca1cba817ca` and the active same-campus `DEV Test Counselor Team` `41426e8e-3b02-4694-9557-918cec8e69d9`. Active counselor-of-record assignment `7d1404aa-09f4-4a25-be7b-37f1b1eea749` was created through the existing authorized assignment RPC. Normal counselor RLS verification with team member `b7bf9f7b-45f8-4780-9243-b0a1d22ef095` can read the new matched case.
- Session configuration was verified read-only in linked DEV. Authored Session 1 `testing` (`a9fd02be-c25f-4653-9447-8111fbc1b7c4`) is published, non-final, has four Material blocks, and published Homework version 1 (`a597381f-655b-45a7-b26a-1b2ef93c5cb2`) with two blocks. Authored Session 2 `new session` (`dea33995-6cd6-4462-85c4-ba57dc77eb79`) is published, explicitly `is_final = true`, has six Material blocks including an available non-archived pinned Resource source, and published Homework version 1 (`4bb57ef4-29c2-4421-8586-bfe131ab9e67`) with three blocks. Builder rank remains Session 1 / Session 2 while raw `sessions.sequence_number` remains internal at 1 / 10.
- New assignment finality is ready: the applied lifecycle RPCs insert the selected template into `case_sessions`; the existing `case_sessions_snapshot_finality` insert trigger reads the current `sessions.is_final`, so a new assignment of `new session` snapshots `is_final = true`. Assigned snapshots remain immutable. The original Phase 3C fixture demonstrates that its already-assigned Session 2 remains pinned `is_final = false`, as expected; changing the Builder template did not retroactively rewrite it.
- Initial fixture state is clean: zero case Sessions, Meetings, Homework assignments, participant progress/responses, and notification deliveries. No Initial Meeting was scheduled, no Session was activated, no lifecycle progression occurred, and no email/provider call was made. The original case `3ffef734-b8a6-4417-aca9-bd43041a9d17` remains active with its existing counselor assignment, completed Session 1, active Session 2 snapshot, and the same three Meeting IDs; it was not reset, reused, modified, or deleted.
- Manual browser sequence: open the new case URL as staff and schedule Session 0; complete Session 0 and activate `Session 1: testing`; sign in as each new partner using the local fixture credentials and submit Session 1 Homework; as staff complete Session 1 and schedule `Session 2: new session`; confirm the assigned Session 2 is Final; because Session 2 currently has published Homework, submit it as both partners; then run Complete Program and verify the completed state in counselor and Couple views. No lifecycle step was executed during setup.
- Validation was limited to linked-DEV fixture checks: exact Auth identity counts/confirmation, direct partner sign-ins, profile/role/membership relationships, counselor assignment and RLS visibility, template Material/Homework/finality readiness, empty lifecycle counts, and preservation of the prior fixture. `git diff --check` passed. No application functionality, migration, generated type, or PROD resource changed. Branch `main`; existing dirty worktree preserved, uncommitted and unpushed.
- Exact next step: open `/workspace/cases/754e4d58-a378-4477-ac06-f93e6b878bc0` as the DEV counselor or Admin and begin the manual Initial Meeting flow; use the `PHASE3C_FINAL_PARTNER_*` local credentials when partner Homework verification is reached.

October 15, 2026 — Phase 3C blocked next-Session progression presentation
- For a non-final authored Session with zero eligible published next Sessions, the existing progression sheet keeps Homework Status and presents a clear `Next Session` blocked state with the approved explanatory copy. It no longer renders an empty selector, meeting date/time controls, or the primary completion action. A submit guard prevents progression if the blocked mode is submitted through another route.
- Once one or more eligible published Sessions exist, the existing selector, scheduling fields, and Complete Session & Schedule Next action remain available. The explicitly final Session remains on its separate Complete Program flow. Eligibility, Homework gates, lifecycle actions, and finality semantics are unchanged; no migration or DEV data change was needed.
- Focused validation passed: 3 files / 43 tests (`session-lifecycle-controls`, counseling session model, and case detail presentation); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser verification remains pending. PROD was not touched. Branch `main`; pre-existing dirty worktree retained, with no commit or push.
- Exact next step: browser-check the blocked non-final progression sheet, verify Homework Status remains visible and no scheduling/completion controls appear, then confirm the normal eligible-next-Session flow and separate final-Session Complete Program flow.

October 13, 2026 — Phase 3C Session Builder validate → save → publish workflow
- Publish remains a single authorized transaction RPC that saves staged Session state and publishes it atomically. Clean Drafts and Drafts with pending Session changes use the same path; a failed RPC returns before transaction commit, so no separate Save click or second publish request is needed. Homework root/version remains optional.
- Client-known invalid state is blocked before the RPC and shown inline. Empty Rich Text identifies its exact Page title: `Complete or remove “{Page title}” before publishing.` Known server-side Session/Homework validation failures from the safe allow-list remain specific and appear inline after Publish; unexpected Publish errors say `The Session could not be published. Please try again.` Save errors use change-save wording without incorrectly blaming Homework. Unreadable publish responses ask the author to reload and confirm status.
- Authorization, Session versioning, Draft/Published/Archived behavior, and server transaction semantics are unchanged. No migration or DEV content change was needed.
- Focused validation passed: 5 files / 50 tests, including unchanged valid Draft publish, staged changes passed to the same publish RPC, failure with one atomic request, named empty Page blocker, no-Homework and Final Session publication, and existing lifecycle states. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser retest remains pending. PROD untouched; branch `main`, existing worktree dirty, uncommitted, and unpushed.
- Exact next step: browser retest Session 2 (`new session`): confirm Publish names its `Empty Page`, complete/remove it, then confirm valid staged changes publish in one action and that no Homework is required.

October 13, 2026 — Phase 3C Session Builder publish eligibility
- Confirmed the editor’s `Publish Session` disabled state comes only from pending state or `sessionPublishError`; unlike `Save Changes`, it does not require unsaved edits. Publish validation requires a title and valid Session Material: at least one block, non-empty Rich Text, valid Video / Link URL, and a selected valid Resource where applicable. An empty Rich Text page is invalid. `Final Session` and Homework presence are not client eligibility conditions.
- The server Session RPC enforces Draft status, title, and the same Session Material validity rules. The transaction coordinator permits publication with no Homework root/version; it only rejects an unavailable Homework version when a Homework root exists and an attempted version must be resolved. Homework remains optional, including for Final Sessions. Existing empty-material requirements were preserved.
- Added concise inline blocker text beside disabled `Publish Session`, so missing/invalid Material explains the disabled state. With valid Material, a clean Draft is immediately publishable even when `Save Changes` is disabled. No server behavior or migration was needed.
- Focused validation passed: 5 files / 48 tests, including no-Homework normal and Final Draft presentation, empty Rich Text blocker messaging, no-version publish RPC arguments, existing material validation, and the server coordinator’s optional-Homework branch. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No DEV data was read or mutated for this task; PROD untouched. Browser retest remains pending. Branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify Session 2’s Publish blocker/helper (remove or complete any empty Rich Text page), and confirm a valid Draft with no Homework publishes without first requiring a Save Changes action.

October 13, 2026 — Phase 3C explicit final-Session designation
- Corrected the Next Step rule: `state.nextSession === null` remains a suggestion/availability signal only and no longer implies program finality. Session 0 and every normal active authored Session show `Schedule Next Session`; an active Couple Session pinned as final shows `Complete Program`.
- Session Builder has a `Final Session` checkbox with the approved helper copy. No shared Checkbox existed, so the editor now reuses the installed Radix Checkbox primitive through a shared `components/ui/checkbox.tsx` wrapper. Its value participates in the editor dirty/save state and is persisted through an overload of the existing transactional Session/Homework authoring RPC under the same Admin/Super Admin/Author authorization.
- Inspected Session Builder schema: Session templates currently have no Session-version table or finality metadata; assigned Material is copied into `case_sessions`, while Homework uses immutable published versions. Added `sessions.is_final` defaulting false and an immutable `case_sessions.is_final` snapshot. A database trigger copies template intent on assignment. Existing sessions and assignments default to non-final; no lifecycle data was rewritten. `complete_counseling_program` now rejects a non-final assigned snapshot while retaining the existing Homework gate, Admin/Super Admin `OVERRIDE`, terminal completion, history, and authorization behavior.
- A normal Session with no eligible published next Session continues to open `Complete Session & Schedule Next`, shows a blocking no-eligible-Session message, and cannot submit without a selected Session. Session selection and builder ordering remain unchanged.
- Local migration files matched linked DEV history through `20261013105000`; this task added the sole pending migration `20261013110000_explicit_final_session.sql`, applied to linked DEV project `lctkqjjkhpyootwvttvj`. Generated Supabase types were refreshed from DEV. Read-only DEV checks confirmed published template `testing` and its existing assigned snapshot are both non-final. No lifecycle action or email was triggered; PROD was not inspected or touched.
- Focused tests passed: 9 files / 91 tests. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser retest remains pending. Branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser retest Session Builder final designation and the Next Step behavior for normal, explicitly-final, Session 0, and no-eligible-Session cases; then resume Phase 3C lifecycle verification.
October 13, 2026 — Phase 3C Counseling Case summary rail cleanup
- Moved the compact Next Meeting summary from the main Session summaries into the right rail directly after Next Step. It uses the existing current Meeting’s date/time formatter and location; the detailed upcoming Meeting remains in the Session presentation, with no separate main-column Next Meeting card.
- Moved Progress after Next Meeting in the right rail. The staff case detail previously rendered the unchanged `X of Y Sessions` value but had no progress bar in this view. Preserved that existing value/calculation and reused the project’s existing bar presentation for ratio-bearing progress labels; completed cases display full progress, while closed cases without a denominator keep their current text without an invented percentage. No lifecycle state or progress source changed.
- Right-rail DOM order is Counseling Status → Prepare & Enrich → Next Step → Next Meeting → Progress; its existing responsive stack preserves this order, and DEV Reset remains after the page section at the bottom.
- Focused case-detail, presentation, lifecycle controls, and notification tests passed (4 files / 33 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser verification remains pending. No lifecycle or notification behavior, email, migration, DEV data, or PROD was changed. Branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify the five-card rail order, the Meeting summary and Progress bar/value at desktop and mobile widths, then continue Phase 3C lifecycle verification.
October 13, 2026 — Phase 3C Counseling Case Next Step and Meeting Invites presentation
- Moved lifecycle controls from the main Session card into the third right-rail card, `Next Step`, after Counseling Status and Prepare & Enrich. A responsive split button uses explicit `cursor-pointer` classes on its enabled primary and menu triggers; shadCN DropdownMenuItem supplies pointer and disabled cursor treatment for menu actions. The app’s prior Safari computed-cursor issue remains unverified in-browser.
- The forward action reads `Schedule Next Session` for Session 0 and an authored Session with a suggested next published Session. A scheduled Session 0 opens the existing Complete Initial Meeting + Schedule First Session sheet; for an unscheduled Session 0, the same label opens the existing Schedule Initial Meeting flow. An authored final Session with no later published Session uses `Complete Program`. Reschedule, eligible authored-Session follow-up, per-partner resend, and destructive Close Counseling Case remain in the split-button menu. No lifecycle action, server authorization, or business behavior changed. DEV Reset remains below the page content and outside the menu.
- Replaced the main-column notification panel with compact `Meeting invites` rows: actual profile first name, newest notification status, latest event/time, and a `View history` affordance. The existing shadCN Sheet presents event type, attempt number, status, timestamp, applicable failure reason, and at most one DEV sink note per viewed history. There are no inline resend buttons or permanently expanded attempt lists. The menu exposes at most one individual resend per partner, tied to the current Meeting and newest eligible delivery; existing server recipient/context checks and Resend/webhook behavior are unchanged. Provider IDs and webhook internals are not displayed.
- The existing case identity projection already supplies each partner's profile `first_name`; carried this value through the case card instead of parsing full names, with a safe full-name fallback when unavailable. Reused the existing shadCN DropdownMenu and Sheet primitives.
- Focused Counseling Case, lifecycle controls, Meeting Invites, and workspace identity tests passed (4 files / 26 tests). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser verification, including Safari pointer cursor and responsive menu/history interactions, remains pending. No lifecycle action was invoked, no email was sent, no migration or DEV data was changed, and PROD was not inspected or accessed. Current branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser retest the Counseling Case rail order, Session 0/next/final action labels, reschedule/follow-up/resend/close menu visibility and wiring, compact partner history Sheets, and enabled/disabled cursor behavior in Safari; then continue Phase 3C lifecycle verification.
October 13, 2026 — Phase 3C Safari lifecycle button cursor diagnosis (runtime unresolved)
- Source inspection confirms the target renders as a native `<button>` with the existing brand-primary classes and no `cursor-*` class. Its submit button’s disabled state depends on pending state, next Session selection, Homework availability/completion, and override confirmation. A separate enabled lifecycle trigger is also a native button. No shared Button component/variants exist. `app/globals.css` contains `button:not(:disabled) { cursor: pointer; }` and `button:disabled { cursor: not-allowed; }`; the lifecycle classes contain no cursor override.
- Safari’s front page is the local app, but `do JavaScript` inspection failed because Safari Developer setting `Allow JavaScript from Apple Events` is disabled. A temporary attempt to enable the setting was rejected by macOS container preferences; no setting change was retained. Therefore the live element’s actual disabled property, computed cursor, and winning stylesheet declaration could not be observed. No CSS fix was made because the exact runtime cause is not established.
- Added focused source-level regression assertions for global enabled/disabled rules and lifecycle button styling/disabled semantics. These cannot prove Safari’s runtime computed style. Browser verification remains required; no lifecycle code, database, email, or PROD change. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: inspect the Complete Initial Meeting submit button in Safari Web Inspector (or temporarily enable JavaScript from Apple Events and restore the setting afterward), recording its `disabled` property, computed `cursor`, and winning CSS rule; then make the narrow correction indicated by that evidence.
October 13, 2026 — Phase 3C scheduling period and button cursor consistency
- New meeting scheduling flows default the shared AM/PM Select to PM. Reschedule flows use `formatMeetingTime` on the saved Meeting’s local `HH:mm`, preserving its actual AM/PM period. Canonical submitted `HH:mm` behavior is unchanged.
- Removed time-field blur validation from the shared lifecycle control. Opening or interacting with the AM/PM Select no longer triggers required/invalid feedback; submit remains authoritative and rejects missing/invalid time or period with the existing inline messages. A PM default keeps new scheduling from entering a missing-period state.
- No shared Button component or variants exist. The existing narrow native-button rules in `app/globals.css` already provide pointer cursor for enabled buttons and not-allowed for disabled buttons, including lifecycle buttons. Added regression coverage for these shared rules; no one-off cursor classes or broader selector changes were needed.
- Focused time validation, lifecycle control, and cursor tests passed; `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Phase 3C browser retest remains pending. No lifecycle/server behavior, migration, DEV fixture, email, or PROD change; branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser retest PM defaults, saved AM/PM reschedule values, and error timing while interacting with the time fields, then continue Phase 3C lifecycle verification.
October 13, 2026 — Phase 3C Couple Workspace meeting-mode duplicate fix
- Trace confirmed the query maps `case_session_meetings.location` directly into `nextMeeting.location`; scheduling RPCs store `In person` in that column. The Couple Workspace appended another hard-coded `In person`, causing the duplicate. Removed only the redundant suffix; the stored location remains the single rendered mode/location value.
- Added focused rendering coverage asserting a rescheduled authored/follow-up Meeting shows its updated date/time and `In person` exactly once. Existing query coverage still verifies selection of the latest uncompleted follow-up Meeting. Session 0 query and presentation logic are unchanged.
- Focused Couple Workspace tests, typecheck, lint, and `git diff --check` passed. Browser verification remains pending; no lifecycle or notification behavior, migration, database, email, or DEV fixture changes. PROD was not inspected or accessed. Branch `main`; dirty worktree remains uncommitted and unpushed.
- Exact next step: browser verify the Couple Workspace date/time and single location display after rescheduling, then continue Phase 3C lifecycle verification.
October 13, 2026 — Phase 3C staff resend presentation consolidation
- Consolidated notification delivery rows by partner in staff Meeting status. Each partner now sees the newest event/status first, one `Resend to this partner` action tied to that partner's newest relevant attempt, and an expandable chronological history retaining each event type, attempt number, status, timestamp, failure detail, and DEV sink indicator. No delivery rows are deleted, merged, or rewritten.
- The existing resend action and notification delivery implementation were not changed. The form continues to submit the current case and Meeting IDs and the selected partner profile plus its latest delivery ID. The server verifies case/Meeting/recipient association; delivery generation reloads the current Meeting start/end and current Session context before sending an individual message.
- Focused presentation and existing notification/webhook tracking tests passed (2 files / 9 tests). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser retest remains pending. No migration, database or email change; PROD was not inspected or accessed. Branch `main`; existing dirty worktree remains uncommitted and unpushed.
- Exact next step: browser retest the staff Meeting Email panel after scheduling and rescheduling, confirm each partner has one resend action and can expand scheduling/reschedule history, then continue Phase 3C lifecycle verification.
October 12, 2026 — Phase 3C live TimeInput formatting correction
- Updated only the shared TimeInput to insert `:` while typing digits at the end of the field. Three-digit entry formats immediately (`300` → `3:00`, `930` → `9:30`). Four-digit entry formats as `hh:mm` (`0300` → `03:00`, `1230` → `12:30`); if the first three digits have already formatted, the component recognizes a following digit as continuation of that entry. Delete events and edits away from the end are passed through unchanged, preserving natural backspace/mid-field editing. AM/PM, blur/submit validation, and canonical `HH:mm` submission remain unchanged.
- Added interaction-level coverage against the shared TimeInput component that sends character-by-character input events and checks visible controlled values, four-digit continuation (including browsers omitting `inputType`), backspace/editing, and partial `3`/`30` values without an inline error. Existing time normalization and lifecycle-control tests remain passing. No lifecycle logic, authorization, DatePicker, migrations, DEV case, or email behavior changed; PROD was not inspected or accessed.
- Focused validation passed: 20 tests across TimeInput, scheduling validation, and lifecycle controls; `npm run typecheck`; `npm run lint`; and `git diff --check`. Browser retest remains pending. Branch `main`; dirty worktree remains uncommitted and unpushed.
- Exact next step: browser retest live digit-only TimeInput behavior, including `300`, `930`, `0300`, `1230`, deletion, and mid-field editing; then continue Phase 3C verification.
October 12, 2026 — Phase 3C scheduling polish and Super Admin authorization correction
- Scheduling sheets no longer repeat the Couple name; scheduling modes show `Schedule a one-hour, in-person meeting.` Other lifecycle modes do not display scheduling helper copy.
- The shared TimeInput retains editable `hh:mm` and separate shadCN AM/PM Select. Numeric keypad entry is accepted without a colon and is normalized on blur or submit (`300` → `03:00`; `930` → `09:30`) while canonical `HH:mm` is sent to the existing lifecycle actions. Manual colon entry still works. Keystrokes clear prior errors; partial values are not validated until blur or submit. One shared normalizer handles digit-only and colon-delimited input.
- Authorization trace: Counseling Case detail exposes lifecycle controls to Admin/Super Admin, while initial scheduling, first-session activation, follow-up scheduling, and rescheduling server actions previously admitted only CARE_ROLES. Their RPCs independently used `private.current_user_can_manage_counseling_case`, which is limited to assigned care staff/campus oversight; that SQL guard emits the observed `Not authorized`. Thus the UI, action guard, and RPC guard did not include the documented Super Admin case-review capability. The action guards now include Super Admin. A narrow Super Admin-only exception in the four RPCs requires the counseling case to exist. Care roles still use the unchanged assigned-case helper. Admin was not added to these four actions/RPCs; previously approved Admin progression, Homework override, and other permissions remain unchanged. RPC grants remain authenticated-only; Couple and anonymous callers remain denied.
- Added forward migration `20261013105000_super_admin_case_scheduling.sql`, applied only to linked DEV project `lctkqjjkhpyootwvttvj`. Before application, linked DEV history was consistent through `20261013104000` with only this migration pending; after application, local and linked DEV histories match through `20261013105000`. This migration changes function bodies only, adds no tables/columns/grants, and does not change generated Supabase types. PROD was not inspected or accessed. The disposable Phase 3C case was not modified, and no email was sent.
- Focused validation passed: 32 tests across scheduling validation, lifecycle controls, and counseling migration coverage; `npm run typecheck`; `npm run lint`; and `git diff --check`. A live impersonated RPC authorization probe was not run: the direct linked-DEV SQL connection was refused by project network restrictions, and the Management API SQL query endpoint rejected the locally available CLI token format. No case mutation was attempted. Browser retest remains pending.
- Branch `main`; worktree remains dirty with prior Phase 1–3C work and current edits uncommitted/unpushed. No commit or push.
- Exact next step: retest concise scheduling copy, digit-only time entry/formatting, and Super Admin initial scheduling in the browser against the unchanged disposable DEV Couple; then resume Phase 3C lifecycle verification.
October 12, 2026 — Phase 3C Structured Shared Time Control
- Reused the existing shared shadCN-style `Input` and `Select`; no time library was added. The shared `TimeInput` shows editable `hh:mm` beside AM/PM and is used once in the shared lifecycle scheduling form, covering all six schedule/reschedule flows. Safari’s segmented native time control remains removed.
- The form holds one editable time string and one AM/PM selection. The shared normalizer pads valid entry (`3:00` → `03:00`) and converts the pair to canonical `HH:mm` for the existing action payload (`03:00` + `PM` → `15:00`). Existing server-side lifecycle contracts are unchanged. Validation runs on blur and submit, not each keystroke; missing time, invalid completed time, and missing AM/PM show inline errors. Date/time/period state remains populated when another field fails or a server action returns an error. The form remains `noValidate` and does not use native time controls.
- Temporary Safari diagnostic UI, logging/state, and DEV submit short-circuit remain removed. The DatePicker is unchanged. Focused scheduling/control and DatePicker tests passed: 16 tests across three files; `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser retest remains pending; the disposable case was not modified; no migration/email activity; PROD untouched; branch `main`; no commit or push.
- Exact next step: retest structured time entry, AM/PM selection, inline validation, and reschedule defaults in Safari, then resume Phase 3C lifecycle verification.
October 12, 2026 — Phase 3C Shared Editable Time Input for Safari
- Confirmed Safari root cause from the DEV diagnostic values: with the segmented native `input[type="time"]` visually showing `03:00 PM`, neither `onInput` nor `onChange` fired, `meetingTime` stayed empty, and the native DOM `input.value` at submit was empty. The native segmented control was not committing an actual value; the validator was not the cause.
- The repo had no shared shadCN `Input` primitive (`components/ui/input.tsx`); the existing DatePicker styles a native text field directly, and `PhoneInput` is feature-specific. Added the minimal shared shadCN-style `Input` primitive and one reusable `TimeInput` built on it. Lifecycle scheduling state stores the single editable string; the shared parser converts it to canonical `HH:mm` during validation, and only that canonical value is placed in the existing action's FormData. There is no competing display/canonical React state. Reschedule defaults format existing `HH:mm` values as `h:mm AM/PM`.
- Removed all temporary `DEV time diagnostics` UI, logging/state, and the development-only submission short circuit. `noValidate`, inline required/invalid feedback, value retention on date/server errors, and server-side lifecycle validation/actions are preserved. The DatePicker was not changed.
- Focused validation passed: 14 tests across scheduling validation, lifecycle controls, and unchanged DatePicker coverage; `npm run typecheck`; `npm run lint`; and `git diff --check`. Browser retest remains pending. The disposable case was not modified; no migration or email activity. PROD untouched; branch `main`; no commit or push.
- Exact next step: retest editable time entry, all-day normalization cases, inline errors, and reschedule defaults in Safari before resuming Phase 3C lifecycle verification.
October 12, 2026 — Phase 3C Canonical Meeting-Time State Wiring Fix
- Trace: the shared input renders `type="time"`, `name="time"`, `value={meetingTime}`, no `defaultValue`, and an `onChange` that writes `event.currentTarget.value` to `meetingTime`; it has no `onInput`. A native time input uses the normalized 24-hour value, so selecting 3:00 PM yields `15:00` even when the browser displays `03:00 PM`. Submit previously read `FormData.get("time")` instead of the controlled state, creating two value sources; the validator could therefore see an empty value while the controlled field displayed a time. The submit handler now calls `validateMeetingSchedule(meetingDate, meetingTime)` and writes the validated canonical time to the existing FormData payload. No independent display-time state was introduced.
- Inline required/invalid handling, `noValidate`, existing server-side validation and lifecycle actions remain unchanged. Because the native input remains controlled and the form closes only after a successful action, date validation failures and server action errors leave the selected time in state and rendered. The DatePicker implementation was not changed.
- Focused scheduling validation/control and DatePicker regression tests passed: 14 tests across three files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser retest is pending; no DEV case was modified, and no lifecycle action or email was triggered. No migration; branch `main`; existing worktree remains uncommitted/unpushed; PROD untouched.
- Exact next step: retest native `15:00` selection, submit validation, and time retention after a server error in the local browser, then continue Phase 3C verification with the disposable DEV Couple.
October 12, 2026 — Phase 3C Scheduling Submit Preservation and Date Focus Fix
- Confirmed from the native `type="time"` control’s value contract and the existing code path that the form value is 24-hour normalized (`HH:mm`, for example `15:00`); a locale-rendered value such as `3:00 PM` is presentation only. Reschedule defaults are already formatted as `HH:mm` by `localMeetingValue`.
- Replaced React’s form `action` usage with a prevented `onSubmit` handler. The previous handler started async transition work and returned immediately, allowing React form-action reset behavior to clear its uncontrolled time input. Meeting time is now controlled state initialized with the current native value for rescheduling. A shared `validateMeetingSchedule`/`normalizeMeetingTime` path validates native time values and runs before any existing server action; accepted values are written back as canonical `HH:mm`. Date and time stay controlled when either field fails validation or a server action returns an error. The existing server validation and lifecycle RPC behavior are unchanged, and `noValidate` still blocks native validation bubbles.
- Updated the shared DatePicker focus treatment to remove the browser blue outline and use a subtle `brand-secondary` focus border; the calendar trigger retains a neutral visible focus background. Added focused coverage for native `HH:mm` acceptance, localized display rejection, required/invalid time, date/time preservation on other-field errors, prevented form reset path, and absence of the blue ring class.
- Focused validation passed: 13 tests across three files; `npm run typecheck`; `npm run lint`; `git diff --check`. No lifecycle action or email was triggered; disposable Phase 3C case remains unscheduled. Browser retest remains pending. No migration; no commit or push; branch `main`; PROD untouched.
- Exact next step: retest valid time retention, inline validation, and DatePicker focus state in the local browser, then resume Phase 3C lifecycle verification.
October 12, 2026 — Phase 3C Scheduling Date/Time Validation Defect Fix
- Extended the existing shared shadCN Calendar + Popover DatePicker with a keyboard-editable text field. Valid dates display and submit as `MM/DD/YYYY` text mapped to the existing ISO date value; calendar selection updates the text. Invalid/incomplete dates and required-date errors render inline with `role="alert"` and the existing `text-sm text-danger-strong` form-error style. The shared component keeps its optional-date behavior for other callers.
- The single lifecycle scheduling form remains the shared path for Schedule Initial Meeting, Reschedule Initial Meeting, Complete Initial Meeting & Schedule First Session, Complete Session & Schedule Next, Schedule Follow-up Meeting, and Reschedule Meeting. Added app-level required/invalid time checks and inline field errors; `noValidate` prevents browser-native validation bubbles. Existing native time control and server-side date/time validation/RPC lifecycle semantics are unchanged.
- Added focused tests for date format and parsing, invalid/incomplete and required date feedback, calendar-to-text wiring, time validation, native validation suppression, shared lifecycle control coverage, and retained lifecycle actions. Focused validation passed: 11 tests across three files; `npm run typecheck`; `npm run lint`; and `git diff --check`. No DEV case lifecycle data or email activity was used for this fix. Browser retest remains pending. No migration; no commit or push; branch `main`; PROD untouched.
- Exact next step: retest date keyboard entry/calendar selection and inline time errors in the existing local browser, then resume Phase 3C lifecycle verification with the disposable DEV Couple and guarded sink.
October 12, 2026 — Phase 3C Disposable DEV Couple Fixture Created (lifecycle verification not started)
- Created only dedicated DEV test identities and one new matched Couple/case; no existing Couple or case was modified. Couple group: `Phase 3C Disposable DEV Couple 20261012-d59ccc28` (`28a7596e-e8ca-4817-bce2-9149a3aeec7d`). Counseling case: `3ffef734-b8a6-4417-aca9-bd43041a9d17`, canonical `matched`, `closed_at = null`. Campus: `Fremont` / `DEV_TEST` (`7695d7ab-0dc1-49a6-a8bf-3ca1cba817ca`). Active Counselor-of-record assignment: `acfa9ec2-8767-458d-bf6e-8f921734c263` to existing `DEV Test Counselor Team` (`41426e8e-3b02-4694-9557-918cec8e69d9`). Its two existing active counselor members remain unchanged. The existing Coach test team has zero active members and was not assigned.
- Partner One profile/Auth ID `3c405e5e-6d5f-4a7e-8a5c-fd728dadcfaa`, login `phase3c-20261012-d59ccc28-one@mailinator.com`; Partner Two profile/Auth ID `7b058708-776a-4391-a870-9e391b8fb482`, login `phase3c-20261012-d59ccc28-two@mailinator.com`. Random passwords are stored only in local `.env.local` as `PHASE3C_PARTNER_1_PASSWORD` and `PHASE3C_PARTNER_2_PASSWORD`; emails are also in `PHASE3C_PARTNER_1_EMAIL` / `PHASE3C_PARTNER_2_EMAIL`. Password values were not printed or included in chat. Both sign-ins were successfully verified using the linked DEV publishable key.
- Provisioning preflight required the exact DEV ref `lctkqjjkhpyootwvttvj`, `DEV_EMAIL_TEST_MODE=true`, and a configured local webhook secret. No Resend send/provider call occurred. The direct Supabase SDK could not insert `case_assignments` (`permission denied`), so that narrow fixture assignment and transition to `matched` were applied in one transaction with `supabase db query` explicitly targeting the linked DEV project; no grants or policies were changed. Verification confirms exactly two Couple members, one active Counselor assignment, `matched`/open state, and zero case Sessions, Meetings, or notification deliveries. No lifecycle action or browser lifecycle verification was performed.
- Template readiness at fixture creation: the only published Session (`testing`, sequence 1) did not yet have a published Homework version. The user later added and published Homework version 1 with Rich Text and Long Answer blocks; read-only verification confirmed Session ID `a9fd02be-c25f-4653-9447-8111fbc1b7c4`, Homework ID `e17a1292-122e-43dd-9d4b-53760851242d`, and Homework version ID `a597381f-655b-45a7-b26a-1b2ef93c5cb2`. Do not modify global Session Builder content as part of fixture creation.
- No migration, generated type, application code, or production resource changed. `.env.local` now holds the two local-only passwords. No commit or push; branch `main`. The later Phase 3C scheduling defect fix entry supersedes this fixture setup next step.
October 12, 2026 — Phase 3C DEV Verification Enablement
- Diagnosed the configured `SUPABASE_SECRET_KEY` by format without exposing it: it is an opaque `sb_secret_…` Supabase secret key, not a legacy JWT service-role key. The current key successfully listed one Auth user through the linked DEV Auth Admin API and completed a read-only `counseling_cases` PostgREST query; `npm run verify:supabase` also returned HTTP 200. Therefore this current DEV credential/request does not produce `JWT issued at future`. The earlier failure cannot be tied to a specific historical token/request because no request trace or token metadata was retained; do not rotate credentials based on that old message. `SUPABASE_ACCESS_TOKEN` is present in the inherited shell but is opaque/non-JWT-like and is a separate Supabase CLI credential, not the credential used by the successful `.env.local` SDK checks.
- The local clock reports `2026-10-12 12:56 PDT`; read-only `sntp time.apple.com` reported an offset of approximately -1 ms. `systemsetup` refused to report the automatic-time toggle without administrator access, so that setting itself is unconfirmed; observed clock accuracy shows no material skew.
- `RESEND_WEBHOOK_SECRET` remains absent. Configure the actual Resend signing secret in local DEV configuration manually; do not invent one or weaken verification.
- `resolveEmailRecipient` routes only with `NODE_ENV=development`, exact `DEV_EMAIL_TEST_MODE=true`, and exact project ref `lctkqjjkhpyootwvttvj`; the only routed address is `delivered@resend.dev`, while intended recipient metadata is preserved. Production mode, any other/missing project ref, or missing opt-in leaves the intended recipient unchanged. Five focused guard tests pass. The local opt-in is currently unset, so the sink is safe by default but not active; set it only for the deliberate local verification session.
- No dedicated disposable counseling Couple/case fixture exists; prior read-only linked DEV inspection found no `DEV Test` case and no active Session or upcoming Meeting. Do not reuse or reset existing real/dev-user cases. Prepared fixture plan (not executed): use two dedicated DEV-only partner Auth accounts/profiles with controlled addresses; create one Couple group and matched counseling case; assign an existing eligible DEV Counselor-of-record team and required Coach assignment; retain existing global published Session/Material/Homework templates; then exercise Session 0, authored Session/Homework release and submissions, follow-up Meeting, reminders, individual manual resend, signed webhook delivery updates, and finally DEV reset. Keep all actual email delivery behind the fixed test sink and verify cleanup/preserved assignment state. Create this fixture only after the webhook secret and explicit local sink opt-in are confirmed.
- Enablement validation only: five focused email-routing tests passed; `npm run verify:supabase` passed; current opaque service credential passed the read-only Auth Admin and PostgREST probes. No fixture or lifecycle data was created/changed, and no full suite/build/knip was run. No automatic-time preference change was made. PROD was not inspected or accessed. Branch `main`; no commit or push.
- Exact remaining blockers: configure local `RESEND_WEBHOOK_SECRET`; explicitly enable the guarded sink for the verification session; then create the isolated disposable Couple fixture and resume Phase 3C end-to-end checks. The prior JWT error is currently cleared/unreproducible with no evidence requiring credential rotation.
October 12, 2026 — Phase 3C DEV-safe Verification (closeout blocked)
- Added a fixed Resend test-recipient route to `delivered@resend.dev`. It activates only when `NODE_ENV=development`, explicit `DEV_EMAIL_TEST_MODE=true`, and `NEXT_PUBLIC_SUPABASE_URL` resolves to the linked DEV ref `lctkqjjkhpyootwvttvj`. Production mode, a different/missing project ref, or a missing opt-in preserves the intended partner address. Delivery rows continue to record the intended partner email and append `_dev_sink` to `template_key`; staff sees a test-routing label. `.env.example` documents the flag as false by default. Unit tests cover the project-ref, mode, and opt-in guards.
- Resend API key, from/reply-to, app URL, cron secret, and Supabase credentials are present locally; no repository-defined alternate safe sink exists. Used Resend's documented `delivered@resend.dev` test address for one message with no Couple information; the provider accepted it. This verifies provider API acceptance only, not a lifecycle email attempt or inbox delivery. Source: [Resend test email addresses](https://resend.com/changelog/sending-test-emails).
- `RESEND_WEBHOOK_SECRET` is missing locally. No real signed provider webhook or delivery-status update was verified. Local cron endpoint returned 401 without authorization. An authorized cron call was not made because the existing local Next server was not launched with the required sink opt-in. The exact linked DEV ref was confirmed before remote checks. Read-only linked DEV migration history is aligned through `20261013104000`; no migration was applied. Read-only DB counts: 3 matched cases, 1 interviewed case, 0 active Couple Sessions, 0 upcoming uncompleted Meetings, and 0 reminder deliveries. Service-role REST read failed with `JWT issued at future`; no data was changed.
- No controlled disposable Couple fixture is available to exercise scheduling, rescheduling, authored Session/Homework release, 72-hour or 24-hour reminders, follow-up, manual resend, webhook updates, Couple Homework page, or DEV Reset. Read-only name categorization found no `DEV Test` named case among the four existing cases. No existing case was reset or modified. No authenticated browser verification was available. `npm run verify:supabase` passed against DEV Auth settings (HTTP 200).
- Focused implementation validation passed: 37 tests across seven notification, lifecycle, case-detail, and Couple Workspace files; `npm run typecheck`; `npm run lint`; and `git diff --check`. The full suite, production build, and knip were not run because end-to-end verification did not pass. The uncommitted worktree was not committed or pushed. Phase 3 remains unclosed.
- Exact next step: configure the correct linked-DEV `SUPABASE_SECRET_KEY` and `RESEND_WEBHOOK_SECRET`, then create or identify a disposable controlled Couple/case fixture. Resume Phase 3C with the fixed sink enabled, complete the DEV lifecycle/webhook/reset and authenticated browser checks, and run the full closeout gate only after those checks succeed.
October 12, 2026 — Phase 3B Homework and Upcoming Meeting Reminders
- Reused the existing Vercel cron infrastructure and `CRON_SECRET` authorization by adding an hourly `/api/cron/meeting-reminders` job. The server-only processor reads the current uncompleted Meeting, case, active case Session, active Homework revision, published Homework blocks, and each partner's own progress. Initial/Session 0 Meetings receive only the 24-hour Meeting reminder; authored Session follow-ups continue to reference the same active Session and Homework assignment.
- 72-hour Homework reminders are sent independently to each partner only when the active authored Session has Homework content and that partner is not submitted/reviewed. The 24-hour Meeting reminder is sent independently to both partners regardless of Homework. Its CTA/content reflects only that recipient's Homework status; no-Homework and Session 0 messages remain Meeting-only. Templates include only Session/Meeting details, a secure Resonate URL, and the signed delivery tag; they omit answers, partner status, Prepare & Enrich, and counseling notes.
- Reminder delivery uses Phase 3A `notification_deliveries`, delivery-key uniqueness, per-event attempt history, provider IDs/status/failures, Resend suppression checks, webhook tags, and webhook status RPC. Idempotency keys include the current Meeting start time, so changing a Meeting creates a distinct future anchor while old unsent dates are no longer queried. A due reminder is skipped when Meeting `updated_at` is later than its target, preventing catch-up after schedule/reschedule inside the 72-hour or 24-hour window. No pending schedule table or migration was needed. Phase 2D cleanup already deletes case delivery rows, and webhook receipts cascade with delivery deletion; there is no extra reminder state to reset.
- Extended staff Meeting delivery history to show the 72-hour and 24-hour reminder status by partner with existing delivery history and individual resend support. Couple pages do not load delivery/provider metadata. Added the authenticated `/workspace/homework` destination for reminder CTAs, with current active published Homework content, the signed-in partner's own answers/progress, explicit save, and submit through existing partner-scoped RPCs. Submitted Homework remains read-only; a partner cannot view the other partner's state or responses.
- No schema changes, migrations, generated-type changes, DEV database writes, or live emails were performed. The linked DEV migration status last recorded at Phase 3A was up to date; this task required no migration check/application. PROD was not inspected or accessed. No browser verification or email send was performed because no DEV-safe email sink is established.
- Focused validation passed: 32 tests across reminder rules/delivery, Phase 3A meeting notification, couple workspace, and case detail test files; `npm run typecheck`; `npm run lint`; and `git diff --check`. No full suite, build, or knip was run. Existing Phase 3A scheduling/rescheduling email tests remain passing.
- Branch remains `main`. Phase 3B and earlier work remain uncommitted and unpushed; see Phase 3C above for verification status and the exact next step.
October 13, 2026 — Phase 3A Meeting Notifications, Delivery Tracking, Resend, and Calendar
- Reused the existing Resend SDK/provider and notification delivery model. Extracted the existing server-only Supabase service-role client into `lib/supabase/service-role.ts` and reused it for intake notifications and Meeting notifications. Lifecycle actions dispatch only after their authenticated scheduling/rescheduling RPC succeeds: Session 0 schedule/reschedule, first authored Session, next authored Session, follow-up Meeting, and authored Meeting reschedule. Email delivery is isolated per Couple partner and cannot change or roll back the Meeting lifecycle transaction.
- Added individual per-attempt delivery records with case/Meeting/profile/email, event type, status, attempt number, resend linkage, provider message ID, failure reason, and delivery timestamps. Unique delivery keys use Meeting + event type + current start time + recipient profile to suppress duplicate automatic sends. Missing partner email is recorded as `no_email`. Resend API/provider suppression checks prevent blind sends to complained, bounced, or suppressed addresses; immediate provider and suppression-check failures remain visible to staff.
- Added a verified Resend webhook endpoint using the SDK verifier and Svix headers. Signed meeting-notification tags identify the exact delivery row, including if a webhook arrives before the send response persists its provider ID. A service-role-only RPC records event IDs with a unique constraint and transactionally updates `sent`, `delivered`, `delayed`, `failed`, `bounced`, `complained`, or `suppressed` state; duplicate/replayed event IDs do not update twice. Webhook failure details are retained after email redaction. No open/click tracking was added.
- Staff Counseling Case detail shows each partner's latest Meeting delivery status, complete attempt history, and one-recipient Resend action per partner. The October 13 presentation consolidation groups all notification events under that partner while retaining each event and attempt. Resend verifies case visibility and membership server-side, sends only to the selected partner using the current Meeting date/time and current Session context, creates a new attempt, and preserves prior attempts. Couple and anonymous roles have no delivery metadata policy or resend action.
- Added reusable safe Google Calendar URL and RFC 5545 `.ics` helpers. Meeting emails include the current event details, a type-appropriate Couple Workspace CTA, a Google Calendar link, and an `.ics` attachment. Calendar content contains only the safe event title, date/time, and Resonate Workspace URL; authored Session email notes that Material and Homework are available, while follow-up email does not suggest a new release. The Couple Workspace already presents the current uncompleted Meeting date/time; the authored Session CTA targets its Current Session section.
- Added forward migrations `20261013100000_meeting_notifications.sql`, `20261013101000_reset_meeting_notification_events.sql`, `20261013102000_allow_missing_notification_email.sql`, `20261013103000_record_webhook_failure_reason.sql`, and `20261013104000_match_webhook_delivery_tag.sql`. The event-receipt FK cascades when Phase 2D deletes case Meeting deliveries, so reset removes notification webhook residue as well. Regenerated `types/database.generated.ts` from linked DEV after schema/RPC updates. Before the first migration, local files through `20261012162000` exactly matched DEV history; each subsequent dry-run showed only the expected Phase 3A migration, and final dry-run reports DEV up to date. A DEV read-only privilege probe confirmed anon/authenticated cannot execute the webhook RPC and service_role can. No fixtures or real emails were created/sent. PROD was not inspected or accessed.
- Focused validation passed: 45 tests across six notification, lifecycle, case-detail, and Couple Workspace test files; `npm run typecheck`; `npm run lint`; and `git diff --check`. No full test suite, build, knip, browser run, or live email test was performed. Browser review remains outstanding. The Resend webhook must be configured with `RESEND_WEBHOOK_SECRET`; `APP_URL`, existing Resend API/from/reply-to settings, and server-side `SUPABASE_SECRET_KEY` must be configured for live delivery.
- Phase 3A was followed by Phase 3B below; see that section for current status and the next step.
October 12, 2026 — Phase 2D DEV Reset Counseling Journey
- Added a DEV + Super Admin-only `DEV Testing` panel at the bottom of staff Counseling Case detail. Confirmation remains disabled until exact uppercase `RESET`; the action uses the existing server Supabase client, role authorization, and case-scoped RPC, with no service-role browser access.
- Added a corrective forward migration `20261012162000_dev_reset_clean_slate_audit_cleanup.sql`. The reset now removes every case Homework assignment and its assignment-linked Homework audit rows, plus case-Session override audit rows, before returning. No inactive Homework shell is retained solely because audit rows referenced it. The normal Homework audit trigger remains append-only; its narrow delete exception requires a transaction-local case ID, DEV JWT issuer, and Super Admin role, and is set only inside the reset RPC. No reset event is inserted.
- The clean-slate reset removes case Sessions, Session 0/authored/follow-up Meetings, released Material snapshots, Homework answers/progress/revisions/assignments, assignment-linked Homework audit rows, Session override audit rows, lifecycle notification deliveries, and case-status history after the latest existing `matched` transition. It restores canonical `matched` with `closed_at = null`, ready for `Schedule Initial Meeting`. The latest pre-run `matched` history remains as baseline; the reset creates no audit or history row.
- Preserved the Couple/case, both profiles and accounts, photos/contact data, invitations, Coach/Counselor/Campus Lead assignments and scope, Prepare & Enrich records, Session Builder templates/versions, global Resources/configuration, assignment audit events, baseline status history, and unrelated cases. No team memberships or counseling assignments are changed.
- Applied only the expected pending migration `20261012162000_dev_reset_clean_slate_audit_cleanup.sql` to DEV project `lctkqjjkhpyootwvttvj`; dry-run confirmed it was the sole pending migration. Linked local/remote history aligns. Regenerated `types/database.generated.ts` (RPC signatures were unchanged). PROD was not accessed or changed.
- A DEV rollback-only lifecycle fixture created a temporary Couple Session, Initial and authored Meetings, Material, published Homework version/release, two partner progress rows and response data, Homework and Session override audit rows, a status transition, and a notification. Reset removed all lifecycle rows/audits and restored `matched`; assertions confirmed Couple membership, case assignments, Prepare & Enrich count, Session Builder template, and unrelated case remained. The entire transaction was rolled back; a follow-up read confirmed no fixture persisted. Admin, Coach, Counselor, Campus Lead, and Couple JWT identities were denied; earlier DEV probes also confirmed exact `RESET`, DEV issuer, and `anon` grant restrictions. Browser verification was not performed.
- Focused reset and case-detail tests passed: 13 tests across three files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v24.21.0`. No full suite/build/knip was run. Current branch is `main`; all work remains uncommitted and unpushed. `PROJECT_STATE.md` was updated. Exact next milestone: `Session Notifications, Calendar & Homework Reminders`.
October 12, 2026 — Scheduling UI consistency and Couple Workspace upcoming Meeting
- Recorded the shadCN-first UI convention: before adding an interactive control, inspect shared project components and installed shadCN components/patterns, and extend/reuse an existing control when it fits. Do not add a parallel custom control without a concrete gap.
- Replaced lifecycle scheduling/rescheduling native date inputs with the existing shared `components/ui/date-picker.tsx`, which uses the project's shadCN Calendar and Popover. Extended its label to distinguish required from optional dates and suppress clearing for required dates. The lifecycle form submits the selected date and preserves server-side required/valid date and time checks. Kept the existing native time input because no shared time picker exists. The six Phase 1–2B lifecycle actions and scheduling semantics are unchanged.
- Couple Workspace already displayed `nextMeeting` as a formatted date and time for Initial Meeting, active authored Session, and follow-up Meetings. Added coverage confirming the value is visible. The query continues choosing the active Session's newest uncompleted Meeting, so an in-place staff reschedule surfaces its updated timestamp while a completed earlier Meeting is excluded. Also filter completed Initial Meetings from the Session 0 fallback so past dates cannot appear as upcoming when no active Session exists.
- No schema or DEV data changes were needed. No migration was applied; PROD was not accessed or changed. Interactive browser/manual verification was not available in this environment.
- Focused date-picker/lifecycle/Couple Workspace tests passed: 46 tests across seven files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v24.21.0`. No full suite/build/knip run was performed per task scope. Current branch is `main`; work remains uncommitted and unpushed.
- Exact next step: Phase 2D DEV Reset Counseling Journey.
October 12, 2026 — Phase 2C Complete Program and Close Counseling Case
- Added authenticated, case-scoped `complete_counseling_program` and `close_counseling_case_incomplete` RPCs. Successful completion marks the active authored Couple Session and its single open Meeting complete, changes the counseling case to existing `finished` status (`Completed`), and writes one real `case_status_history` transition. It creates no next Session or Meeting and preserves released Material/Resource snapshots, Homework assignments/responses, and history.
- Complete Program uses the Phase 2A Homework gate: exactly two participant progress rows must exist and both must be `submitted` or `reviewed` for care-team completion. Admin/Super Admin may bypass only with exact uppercase `OVERRIDE`; an audit event records the override, and no Homework progress or response is changed. The detail control shows each partner's current status, outstanding partner names, and Admin-only override prompt when needed.
- Close Counseling Case ends the active Couple Session and any open Meetings, changes the case to existing `inactive` status (`Closed — Incomplete`), and records one history transition with the selected reason. Care-team roles must select a reason from Couple withdrew, Unable to contact couple, Couple relocated, Referred elsewhere, Counseling relationship ended, or Other; Other requires notes. Admin/Super Admin may omit the reason. No lifecycle history or participant data is deleted and no next Session is created. Terminal case states render without progression controls.
- Added and applied only the expected pending DEV migration `20261012150000_complete_program_close_case.sql` to linked DEV project `lctkqjjkhpyootwvttvj` (`Marriage Ministry Dev`). It removes the legacy `close_counseling_case(uuid)` RPC that could mark cases finished based on final Homework without completing the case Session. Regenerated `types/database.generated.ts` from DEV. DEV local and remote migration history now align. PROD was not accessed or changed.
- DEV authorization checks confirmed anonymous RPC execution is denied by grants and a Couple-role identity is denied by both lifecycle RPCs. DEV currently has zero active Couple Sessions and zero open Meetings, so successful staff completion/closure and live Homework allow/override paths could not be exercised without creating fixtures. Browser/manual verification remains outstanding.
- Focused Phase 2C/lifecycle tests passed: 38 tests across four Counseling Sessions files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v24.21.0`. No full suite/build/knip run was performed per task scope. Current branch is `main`; all Phase 1 through Phase 2C work remains uncommitted and unpushed.
- Exact Phase 2D next step: `Couple Session Assignment & Delivery` — design and implement stable Couple-specific Session Page selection and delivery while preserving assignment/version history.
October 12, 2026 — Phase 2B Follow-up Meeting scheduling
- Added authenticated, case-scoped `schedule_followup_case_session_meeting` for an active Couple Session. It locks the open case and active Session, marks the latest Meeting complete when it is still open, and inserts a new Meeting row under that same `case_session_id`. It does not insert/update a Couple Session, change `actual_sequence`, touch Material/Resource snapshots or Homework assignment/progress, or write case-status history. Existing Meeting rows remain in place.
- Replaced the existing reschedule RPC in a forward migration so it updates only the latest uncompleted Meeting for an active Couple Session, in place. It rejects completed/history Meetings and does not create rows or alter case status. The Phase 2A `complete_case_session_schedule_next` RPC was not changed.
- Staff case detail now offers `Schedule Follow-up Meeting` beside the unchanged Phase 2A primary action. It shows the current upcoming Meeting, previous Meetings with their recorded completion status, and keeps Reschedule attached to the current upcoming Meeting. The Counseling Sessions query chooses the newest uncompleted Meeting. Couple Workspace also selects its active Session's newest uncompleted Meeting; its material, Homework, and progress reads remain unchanged.
- Added and applied only the expected pending DEV migration `20261012140000_schedule_followup_case_session_meeting.sql` to `lctkqjjkhpyootwvttvj` (`Marriage Ministry Dev`). Linked migration history now aligns with no pending migrations. Regenerated `types/database.generated.ts` from linked DEV, excluding the shell's stale `SUPABASE_ACCESS_TOKEN` override. PROD was not accessed or changed.
- DEV authorization checks denied anonymous scheduling, Couple scheduling, and Couple rescheduling. DEV contained zero active Couple Session fixtures, so a live authorized create/reschedule cycle could not be exercised. Focused tests cover same-Session Meeting history/current selection, Couple Workspace upcoming Meeting selection, RPC invariants, rescheduling in place, and unchanged Phase 2A RPC definition. Browser/manual verification remains outstanding.
- Focused tests passed: 43 tests across six Counseling Sessions and Couple Workspace files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No full suite/build/knip run was performed per task scope. Current branch is `main`; Phase 1, Phase 2A, and Phase 2B work remains uncommitted and unpushed.
- Exact Phase 2C next step: implement Complete Program and Close Counseling Case, including the approved completion/closure lifecycle and authorization while preserving Session and Meeting history, Homework status, release snapshots, and case-status history invariants.
October 12, 2026 — Phase 2A Session completion, Homework gate, and next-Session scheduling
- Extended the active authored `case_sessions` flow with authenticated-only `complete_case_session_schedule_next`. In one transaction it validates the active case Session and its pinned Homework revision, completes the current Meeting and Session, increments `actual_sequence`, activates the chosen published Session, snapshots its Material/Resource versions, pins Homework, and schedules its first Meeting. Equal Material/Homework release timestamps and the existing one-active-Session unique index preserve Phase 1 release and activation invariants. Template sequence suggests the next Session; staff may choose any eligible published Session without changing Builder order.
- Required exactly two Homework progress rows with both statuses `submitted` or `reviewed`. Coach/Counselor/Campus Lead progression is blocked otherwise. Admin/Super Admin may proceed only with the exact `OVERRIDE` string; the RPC checks the role and exact value, leaves Homework progress unchanged, and records an audit event. The UI keeps each partner's Homework status visible, shows the explicit warning and override field only for Admin/Super Admin, and follows the Homework revision pinned to the active Couple Session.
- Admin/Super Admin can open case detail for the required review/override path. Case read access remains case-scoped by existing case existence and RLS; Homework read policies use narrow Security Definer predicates to avoid the established revision/progress RLS recursion. The new lifecycle RPC remains restricted to care-team case managers or Admin/Super Admin and to authenticated execution; anonymous access and Couple mutation remain denied. Phase 1 initial scheduling/rescheduling and the right rail remain in place. Follow-up Meeting scheduling is recorded in the newer Phase 2B entry; program completion and case closure remain unimplemented.
- Added and applied only the expected pending DEV migration `20261012130000_complete_case_session_schedule_next.sql` to `lctkqjjkhpyootwvttvj` (`Marriage Ministry Dev`); the linked migration list now aligns with no pending migrations. Regenerated `types/database.generated.ts` from linked DEV, excluding the shell's stale `SUPABASE_ACCESS_TOKEN` override. PROD was not accessed or changed.
- Read-only DEV authorization check confirmed Admin case visibility (4 cases), Couple case visibility (1 case), and denial of anonymous and Couple calls to the progression RPC. DEV had no active Couple Session fixture for a successful end-to-end completion/override run, so the live transition path was not exercised. Browser/manual verification remains outstanding.
- Focused tests passed: 34 tests across five Counseling Sessions files. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No full suite/build/knip run was performed per task scope. Current branch is `main`; existing Phase 1 and current Phase 2A work remain uncommitted and unpushed.
- Phase 2B supersedes this original next-step note. The remaining Phase 2C work is recorded in the newer Phase 2B entry above.
October 12, 2026 — Phase 1 Session Lifecycle Foundation
- Added the case-specific `case_sessions` model between published Session Builder templates and scheduled Meetings. `actual_sequence` records the order used by the Couple independently of `sessions.sequence_number`; a partial unique index enforces one active Couple Session per counseling case. Session 0 remains a built-in lifecycle step represented by the existing null-template initial Meeting, so it does not require a Session Builder template.
- Added immutable release records in `case_session_material_blocks`. First Session activation copies the published template Material, pins each linked Resource Version, and pins the current published Homework through `homework_assignment_revision_id`. Material and Homework share the same release timestamp and become Couple-readable together through case-scoped RLS. Couple Workspace now reads the active case Session and released snapshots rather than mutable live Session Material; Resource open/download links carry the pinned version.
- Extended `case_session_meetings` with a `case_session_id` relationship plus completion metadata. Meetings remain separate scheduling records beneath the lifecycle step or Couple Session, allowing future multiple Meetings per Session. Initial and authored rescheduling update the same Meeting date/time, do not recreate the case Session, and do not release content again. Existing overwrite-on-reschedule history semantics are preserved.
- Added authenticated-only Security Definer RPCs: `schedule_initial_case_meeting`, `activate_first_case_session`, and `reschedule_case_session_meeting`. The activation RPC locks the case/initial Meeting, accepts any published Session chosen by staff, completes Session 0, creates actual Couple sequence 1, pins Material and Homework, schedules the first authored Meeting, and performs only a real pre-active status transition to `active`. The former authored-template progression RPC is no longer executable by authenticated callers. Existing case-scoped Campus Lead/Coach/Counselor authorization remains authoritative; Couple and anonymous mutation attempts were denied in DEV.
- Moved lifecycle controls to the staff Counseling Case detail and retained the Counseling Status and Prepare & Enrich right rail. The detail supports unscheduled Session 0, scheduled Session 0 with Reschedule plus `Complete Initial Meeting & Schedule First Session`, and active authored Session with its completion progression plus Reschedule. Workspace cards remain informational links with no scheduling or lifecycle buttons. Follow-up Meeting scheduling is added in Phase 2B; program completion and case closure remain unimplemented.
- DEV migrations `20261012100000_session_lifecycle_foundation`, `20261012110000_session_lifecycle_rpc_grants`, and `20261012120000_fix_first_session_activation_identifiers` are applied to project `lctkqjjkhpyootwvttvj`; local and DEV histories align with no pending migration. The third forward migration fixed a PL/pgSQL identifier collision discovered by live validation; already-applied migrations were not edited. `types/database.generated.ts` was regenerated from linked DEV after the schema migration. PROD was not accessed or changed.
- Live DEV validation used a clean counselor-visible test case and temporary Session/Material/Homework records. It confirmed initial schedule and in-place reschedule, Session 0 completion, selection of a published template at template sequence 23 as actual Couple sequence 1, exactly one active case Session, one released Material snapshot, a pinned Homework Version with two participant progress rows, authored Meeting creation and in-place reschedule, and rejection of repeat first activation. Cleanup was verified with zero verifier Sessions and zero case Sessions remaining. Direct Couple and anonymous lifecycle RPC calls were denied. Couple-facing snapshot reads were not browser-verified because the known test Couple accounts were not members of the counselor-visible clean case.
- Focused lifecycle/Couple/route/Resource coverage passed (59 tests across 14 files). Full `npm test` passed (564 tests / 106 files), along with `npm run typecheck`, `npm run lint`, `npm run build`, `npm run verify:supabase`, and `git diff --check`. `npm run knip` was also run and continues to report the repository's existing unused files/exports and unlisted `sharp` / `@tiptap/core` dependencies; it found no new Phase 1 file as unused. Browser/manual UI verification remains outstanding. The branch is `main`; all Phase 1 changes are uncommitted and unpushed for manual review.
- Phase 2A supersedes the original next-step note. The remaining lifecycle milestone is recorded in the newer Phase 2A entry above.
October 8, 2026 — Counseling Workspace / Coach Assignment / Couple Presentation milestone closeout validation
- Final scope includes workspace routing and RPC handling for Campus Lead, Coach, Counselor, and Couple; counseling case/contact drill-downs; shared card/avatar presentation; case-specific Prepare & Enrich documents; active Coach versus Counselor assignment semantics and Coach-specific Admin unassignment; and Couple display-name precedence plus the corrective scheduling-history migration. Existing team-name and Counselor-of-record behavior remains separate.
- DEV migrations `20261007110000_counseling_workspace_couple_identity`, `20261007120000_unassign_coach_case_assignment`, `20261007130000_couple_custom_name_precedence`, and `20261008100000_fix_counseling_case_status_history` are recorded as applied. Local and DEV migration histories are aligned with no unexpected pending or remote-only migration. PROD was not accessed or changed.
- The Couple custom-name edit was confirmed manually in the browser per the user. The optional final clear-to-derived browser check was not repeated during closeout; focused tests cover clear-to-derived behavior. The status-history audit found no prior false `active → active` rows. A live new status-transition row was not generated because DEV has no published Session Homework version, and no test data was created for closeout.
- Final validation passed: `npm test` (557 tests / 106 files), `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. No temporary debug logging or unrelated changes were found. Generated Supabase types correspond to the approved DEV migrations; the final corrective migration does not change types.
- Milestone implementation and migration work was committed as `8cf7c2f` (`feat: stabilize counseling workspaces and coach assignments`) and pushed to `origin/main`; local `main` matched `origin/main` at that commit. This final state update records the completed Git closeout. Exact next milestone: `Couple Session Assignment & Delivery` — design and implement stable Couple-specific Session Page selection and delivery while preserving assignment/version history. Do not begin it in this closeout.
October 8, 2026 — Counseling case status-history correction
- Confirmed defect in the already-applied `20261002100000_counseling_sessions_workspace.sql`: `schedule_case_session_meeting` updated a case to `active` before reading its status into `case_status_history.from_status`, allowing false `active → active` history rows.
- Added and applied new DEV migration `20261008100000_fix_counseling_case_status_history.sql`; the applied migration was not edited. The replacement captures case status while locking the open case, preserves all meeting/session/homework scheduling logic, and records `previous_status → active` only for the existing `requested`, `assessment`, `interviewed`, and `matched` transitions. Already-active cases get no synthetic transition.
- Read-only authenticated DEV audit found no existing `active → active` rows; no history records were changed. There was no published Session Homework version in DEV, so an authenticated live matched-to-active scheduling exercise was not run; doing so would require changing DEV data or creating/publishing fixtures. Existing DEV data was not changed by this validation.
- DEV migration history is aligned with no pending local migrations or remote-only migrations; correction version `20261008100000` is recorded. No other migration was applied. PROD was not accessed or changed.
- Focused counseling-session regression tests passed (20 tests across 4 files, including migration regression assertions for pre-update status capture, real transition-only history, preserved scheduling paths, and the unchanged history reason). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No generated types changed.
- The status-history correction and this state were included in milestone commit `8cf7c2f`, pushed to `origin/main`. No historical rows were changed. The optional custom-name clear-to-derived browser check remains outstanding; the user confirmed the edit in browser and focused tests cover clearing.
October 8, 2026 — Couple custom display-name DEV migration and validation resumed with full network access
- Full-access connectivity is working: `supabase migration list --linked` connected to DEV project `lctkqjjkhpyootwvttvj` (`Marriage Ministry Dev`). The local and remote migration histories matched except for the expected pending `20261007130000_couple_custom_name_precedence.sql`; no unexpected migration was pending.
- Applied only `20261007130000_couple_custom_name_precedence.sql` using `supabase db push --linked`. A subsequent linked migration listing recorded it as applied. No other migration was applied. PROD was not accessed or changed.
- Regenerated/compared `types/database.generated.ts` using `supabase gen types typescript --linked`; the generated DEV output exactly matched the existing file. No typing workaround removal or type-file edit was necessary.
- Authenticated read-only DEV inspection of the known Couple found group `ee688620-2959-499f-bde1-9608ba3d7527`, original group name `Adam Butcher & Anna Wong`, and active partner profile names `Test Couple One` / `Test Couple Two`. No Couple, profile, photo, membership, or relationship data was changed; the original state remains as read.
- Automated regression validation passed: 39 tests across `features/people/queries.test.ts`, `features/people/detail-actions.test.ts`, `features/counseling-sessions/workspace-identity.test.ts`, and `features/counseling-sessions/migration.test.ts`. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser automation is unavailable in this workspace (no Playwright or agent-browser executable/package installed).
- At the time of this read-only DEV check, custom-name Save/display/clear had not been exercised in the browser and the original Couple state was preserved. The user subsequently confirmed the custom Couple-name edit manually in the browser. The optional clear-to-derived browser check remains outstanding; focused regression coverage passed. No DEV naming data was changed in this validation.
- This entry records the earlier post-migration check. Current milestone completion, the user-confirmed edit review, and the optional outstanding clear-to-derived browser check are recorded in the newer closeout entry above.
October 8, 2026 — Couple custom display-name precedence implementation (initial status; superseded by the full-access validation entry above)
- Trace confirmed Admin Save already writes the existing `groups.name`; read-only DEV inspection had a saved Couple name (`Adam Butcher & Anna Wong`) that differed from the two partner profile names, while presentation showed only the partner names. Root cause was the shared `coupleDisplayName` resolver choosing profiles before a saved group name.
- Updated the shared Couple resolver to prefer a non-placeholder saved group name when it differs from the partner-derived default. List/detail/breadcrumb/assignment summaries and Couple Workspace already use this helper. Counselor Sessions and staff case detail use the case-scoped identity RPC; a narrow migration adds `groups.name` to that RPC projection while retaining the same case-access predicate, active members filter, and authenticated-only execute grant. Coach/Counselor team names continue to use their existing direct group-name paths.
- Couple edit now allows an empty name only for Couple groups. Because `groups.name` is non-null, clearing stores the current partner-derived name (or existing pending/invitation fallback) rather than blank; profile names are not edited. Other group/profile name validation remains required.
- Added focused resolver, save/clear action, session identity, and migration-scope tests. Focused tests passed (39 tests across 4 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v26.8.2`.
- The pending migration and offline-connectivity statements from this initial status were superseded by the successful full-access DEV migration application, linked type comparison, and read-only Couple-state inspection documented in the later October 8 validation entry above. Browser-authenticated custom-name Save/display/clear/restore remains outstanding and is carried forward in that entry.
October 7, 2026 — Admin Coach Team Unassign flow correction and DEV validation
- Root cause: the Coach Team Assigned Couples list was populated from active `coach` assignments, but its Unassign action reused the Counselor-of-record component/action. The action preflight required `assignment_type = counselor`; the existing `unassign_counseling_case` RPC also only ends Counselor assignments. The current active Coach assignment was `7a2ca407-2106-4267-96c0-a3405d9062bd`; the UI did not render or submit an assignment ID. It submitted Couple group ID `ee688620-2959-499f-bde1-9608ba3d7527` and Coach Team ID `5367e55e-0753-457c-b1b5-054debc5f8c8`, then incorrectly resolved a Counselor assignment. The older Coach assignment `7afde1ad-840f-461f-b889-2dbd873f1ab0` was already ended and was not selected.
- Coach rows now carry their counseling case ID. The Coach action preflights the exact case + Couple + Coach Team + active `coach` assignment and calls a dedicated Admin-only `unassign_coach_case_assignment` RPC. The RPC locks the case/current matching assignment, ends only that Coach row, preserves history, and writes a `case.unassigned` audit event. The Counselor path and RPC remain unchanged. No broad `case_assignments` write policy was added; authenticated direct writes remain unavailable.
- Added migration `20261007120000_unassign_coach_case_assignment.sql` and applied it to DEV `lctkqjjkhpyootwvttvj` as the only pending migration. Supabase types were regenerated from linked DEV and include the new RPC signature.
- Live authenticated DEV test re-read the exact precondition, then ended Coach assignment `7a2ca407-2106-4267-96c0-a3405d9062bd` with preserved end reason/history. Admin James & Gina Assigned Couples count/list is now 0 and excludes case `48e…`. Gina and the other James & Gina Coach no longer see `48e…` or its Couple identity. Active Counselor assignment `eda35d96-436f-44aa-a937-0050ec3d5b3d` and Couple relationship `ee688620-2959-499f-bde1-9608ba3d7527` are unchanged. The earlier historical Coach assignment remains ended.
- Focused tests passed (12 tests across 4 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser verification was not performed. PROD was not accessed or changed. Worktree remains dirty/uncommitted on `main` with all prior changes preserved; nothing committed or pushed.
- Exact next step: authenticated browser review of the James & Gina Admin detail (count 0/no Couple row), plus both Coaches' `/workspace` to confirm the Couple card is absent. No further DEV data mutation is needed for this case.
October 7, 2026 — Approved Coach fixture reconciliation (DEV only; initial token attempt was blocked and later resolved below)
- The approved plan is to transfer case `48e9f797-f149-4bd7-afb5-7cad847bb28d` from the duplicate DEV Test Coach Team (`24fbc0e5-01b3-4939-8a38-0b4bb50b3be8`) to canonical James & Gina Jacobs (`5367e55e-0753-457c-b1b5-054debc5f8c8`) through `public.assign_counseling_case`, then end (not delete) Gina's and Test Coach's duplicate active memberships in the former team. Approval is explicit; the scope is DEV only.
- The normal authenticated Admin RPC attempt was rejected before mutation with PostgREST `PGRST303`, `JWT issued at future`. A read-only post-failure check confirmed the original Coach assignment remains active and unchanged. Neither duplicate membership was ended. The Counselor assignment and all other records remain untouched; no service-role bypass was used. Local UTC matched the runtime clock at the time checked, so the token/API clock mismatch remains unresolved.
- No code, schema, migration, RLS, or generated types changed. PROD was not accessed or changed. No tests/typecheck/lint were run; `git diff --check` passed. Existing worktree remains dirty/uncommitted on `main`, including unrelated prior changes, all preserved. Nothing committed or pushed.
- This initial attempt was superseded by the successful fresh-session reconciliation documented below; it did not mutate data.
October 7, 2026 — Coach fixture reconciliation completed (DEV only)
- Refreshed the Admin session through normal password login against DEV `lctkqjjkhpyootwvttvj`. Fresh JWT `iat` matched current UTC, `getUser` and authenticated profile/role reads succeeded, resolving the prior `JWT issued at future` rejection.
- Through authenticated `public.assign_counseling_case`, transferred case `48e9f797-f149-4bd7-afb5-7cad847bb28d` from DEV Test Coach Team `24fbc0e5-01b3-4939-8a38-0b4bb50b3be8` (old assignment `7afde1ad-840f-461f-b889-2dbd873f1ab0`, now ended) to James & Gina Jacobs `5367e55e-0753-457c-b1b5-054debc5f8c8` (new active assignment `7a2ca407-2106-4267-96c0-a3405d9062bd`). No direct assignment-table or service-role bypass was used.
- After verifying the new active assignment, ended (did not delete) Gina's duplicate membership `6cb8c60d-3880-4908-a3f7-a2904edb43d9` and the other Coach's duplicate membership `6ed1e959-6c08-4d64-bd4b-9b86a3c620dc` through authenticated Admin RLS. Both canonical James & Gina memberships remain active (`6a070418-cdb0-4dee-8794-6cb04fec9439`, `3d9bf3e5-18fa-437c-8c33-860b0775f649`); DEV Test Coach Team now has zero active members.
- Authenticated DEV checks: Gina and the other James & Gina Coach each see exactly case `48e…`; each identity RPC returns Test Couple One and Test Couple Two with both photo paths available and no pending-invitation fallback. Both are denied unrelated Team Two case `2b7…` and its Couple identity. Admin active Coach assignment list/count agrees (1 for James & Gina, target case included; target absent from DEV Test Coach Team). The case Couple relationship and active Counselor assignment `eda35d96-436f-44aa-a937-0050ec3d5b3d` remain unchanged.
- PROD was not accessed or changed. No code, schema, migrations, RLS, or generated types changed. `git diff --check` passed; tests/typecheck/lint were not applicable. Worktree remains dirty/uncommitted on `main`, preserving prior work. Nothing committed or pushed.
- Exact next step: USER AUTHENTICATED BROWSER REVIEW of `/workspace` as Gina and the other James & Gina Coach to confirm couple cards, names/photos, and absence of unrelated cases in the rendered UI; also review Admin People & Teams Assigned Couples for the canonical team.
October 7, 2026 — Admin Coach Assigned Couples alignment
- Confirmed root cause: `features/people/detail-queries.ts` and the Admin People records loader filtered active team assignments to `assignment_type = counselor`, so a Coach Team's card/count did not reflect the active `coach` assignment used by Coach Workspace.
- Admin Coach Team detail now loads active `coach` assignments for its Assigned Couples list. Admin Coach counts use active Coach assignment counts. Counselor Team list/count continues to use active Counselor-of-record (`counselor`) assignments; Campus Lead assignment semantics and Coach Workspace behavior are unchanged. Inactive assignments remain excluded.
- Added focused coverage for Coach-vs-Counselor relationship selection, active assignment counts, count/list rendering, empty Coach Team state, and existing Counselor card behavior. Under Node `v26.8.2`, focused tests passed (26 tests across 4 files), `npm run typecheck`, `npm run lint`, and `git diff --check` passed.
- Read-only authenticated DEV comparison for `DEV Test Coach Team Two` found one Coach Workspace case and one Admin-visible active Coach assignment with matching case IDs. No database, schema, RPC, RLS, or generated-type changes. PROD untouched; no browser was used.
- Follow-up trace of the “still 0” report: Admin route `/people/[recordId]` calls `getPeopleDetail` in `features/people/detail-queries.ts`; that loader feeds `detail.assignedCouples` into `PeopleDetailPage`, whose `AssignedCouples` card renders the list and `rows.length` count. The exact loader query now filters active assignment rows by the shared Coach-to-`coach` mapping. `features/people/queries.ts` separately feeds `/people` team-summary counts/statuses, also now using active Coach counts. No duplicate detail query, explicit route cache, `force-static`, or stale derived card count was found. In current DEV, `James & Gina Jacobs` (`5367e55e-0753-457c-b1b5-054debc5f8c8`) has zero active Coach assignments; `DEV Test Coach Team Two` (`72bb363b-6c4a-4a29-8a29-3c2c0319b1ec`) has one, for the same case shown in TEST_COACH_3's Workspace. The authenticated Admin detail query for Team Two returns one row with the Couple group and both member names. This confirms the prior zero was for a different Coach Team record, not a missing query fix, if the page in question is James & Gina. A local server was not listening at `127.0.0.1:3000`, so an alternate-port browser session could not be checked; if the browser is on Team Two and still shows zero, stale runtime remains unverified. No source code changed during this trace. Exact next step: confirm the browser URL/team ID; compare it with `72bb363b-6c4a-4a29-8a29-3c2c0319b1ec` (Team Two) versus `5367e55e-0753-457c-b1b5-054debc5f8c8` (James & Gina), then reload the matching Admin detail route.
- Worktree remains dirty/uncommitted with all prior work preserved; nothing committed or pushed.
- October 7 read-only DEV Coach authorization trace for Gina Jacobs: Auth user and profile are the same ID `26e55e37-b4dd-42b0-8bdf-859e1045d465` (`res.coach2@mailinator.com`), active, with role `coach`; only one profile/Auth account matched Gina Jacobs. She has two active `coach_team` memberships: James & Gina Jacobs `5367e55e-0753-457c-b1b5-054debc5f8c8` (membership `6a070418-cdb0-4dee-8794-6cb04fec9439`, joined `2026-08-23T16:45:15.57975Z`, no end date) and DEV Test Coach Team `24fbc0e5-01b3-4939-8a38-0b4bb50b3be8` (membership `6cb8c60d-3880-4908-a3f7-a2904edb43d9`, joined `2026-10-07T16:43:34.775094Z`, no end date). There is no per-membership role column; her profile role is Coach. Her Team Two membership `cf35503d-59af-43f4-9fe1-839e2a5e86e3` ended `2026-08-23T16:45:15.552Z`, before the target case’s Coach assignment began Sep 11. No active Campus Lead assignment or direct case-profile assignment exists for Gina.
- Target case `2b7a6530-156a-4de1-aa5a-d901c88708dd` has active Coach assignment `ad1b803b-9bbc-4961-bee7-6313fd184895` to Team Two `72bb363b-6c4a-4a29-8a29-3c2c0319b1ec` and active Counselor assignment `044fb020-3a5e-4f9a-a73f-225600c0bdc9` to Counselor team `74dd5b29-149f-4cd4-91e9-5c2c8e337b3d`. Gina has no active membership in either assigned group, no active membership in the Couple group, no Counselor/Couple/Campus Lead/Admin role, and no active campus-lead scope. Her authenticated target-case RLS query returned no row and `get_counseling_workspace_couple_identity` returned zero rows. The latest `private.current_user_can_access_case` predicate grants Coach access only through an active `coach` case assignment joined to the caller's active membership in that assigned group; its other branches (campus oversight, Couple membership, Counselor assignment, Campus Lead assignment) do not match Gina. Thus the target Team Two case is not visible to Gina's current DEV session; no auth-code or policy leak was found.
- The case currently returned in Gina's Coach Workspace is a different case, `48e9f797-f149-4bd7-afb5-7cad847bb28d` (Couple `ee688620-2959-499f-bde1-9608ba3d7527`, Test Couple One & Test Couple Two). Its active Coach assignment `7afde1ad-840f-461f-b889-2dbd873f1ab0` is to DEV Test Coach Team `24fbc0e5-01b3-4939-8a38-0b4bb50b3be8`, of which Gina is currently an active member. That is the valid predicate path explaining the current workspace card. The same two people (Gina and Test Coach profile `6a8b7ef3-a98e-430a-a056-b7df89086049`) are active members of both James & Gina and DEV Test Coach Team, violating the one-active-team-per-operational-type invariant. A prior Team Two membership is ended and does not grant access.
- Root cause is a DEV fixture/data overlap plus mistaken case identification, not broad Coach authorization: Gina sees case `48e…` assigned to her active `DEV Test Coach Team`; she does not currently see case `2b7…` assigned to Team Two. Recommended cleanup, pending explicit approval: if James & Gina is canonical as expected, move case `48e…`'s Coach assignment from duplicate Team `24fbc0e5-01b3-4939-8a38-0b4bb50b3be8` to canonical Team `5367e55e-0753-457c-b1b5-054debc5f8c8`, end both duplicate active memberships in Team `24fbc0e5-01b3-4939-8a38-0b4bb50b3be8` (Gina `6cb8c60d-3880-4908-a3f7-a2904edb43d9`, Test Coach `6ed1e959-6c08-4d64-bd4b-9b86a3c620dc`), then decide whether the now-empty test group should remain or be deactivated. Do not alter target case `2b7…`, Team Two membership, code, or RLS as part of that cleanup. No code or DEV data was changed; no tests/typecheck/lint were run for this read-only trace. Worktree remains dirty/uncommitted. Exact next step: approve or reject the proposed DEV fixture reconciliation; meanwhile, confirm the browser card's case ID against `48e…` versus `2b7…`.
October 7, 2026 — Couple and Counseling Team Homework status
- Added the server-authorized Couple experience at the shared `/workspace` entry point. It resolves the authenticated partner's own case server-side; no Couple case ID is accepted from the browser, and `/workspace/cases/[caseId]` remains counseling-team-only. Campus Lead, Coach, Counselor, Admin, and Super Admin routing is unchanged.
- The new Couple Workspace presents paired identity, current counseling status, only the active scheduled Session and its read-only published Session Material, individual Homework status, next in-person meeting, counseling team, and actual published-session progress. A dedicated `Your Homework` card now sits between Current Session and Next Meeting and shows `No homework assigned yet.` when no current assignment exists (including Initial Meeting); otherwise it shows the contextual `Session N Homework` label and only the signed-in partner's status. The query uses valid root fields (`id`, `session_id`) and explicitly filters and matches progress by authenticated profile ID. There is no participant homework-response editor in the repository; the card exposes no written responses or other partner's status. The four main cards now reuse the Counseling Team detail's `grid gap-4 sm:grid-cols-2` layout: desktop row 1 is Current Session / Your Homework; row 2 is Next Meeting / Counseling Progress. At mobile widths they remain one column in that same order.
- The Couple rail order is Counseling Status, Counseling Team, then the final Prepare & Enrich card. It exposes only `Couple Version` through `/workspace/prepare-enrich`, whose server route resolves the signed-in Couple's own case and returns the existing protected signed download. Counselor Copy, staff controls, scheduling/rescheduling, close-case controls, Session Builder, Resource Library management, and detailed other-session content remain absent.
- Applied DEV-only migration `20261006120000_couple_workspace_access.sql` to `lctkqjjkhpyootwvttvj`; PROD remains untouched. The migration adds narrow current-session/current-material reads, current-session resource reads, a security-definer team-name projection for the authenticated Couple's own case, and Couple Version document/storage reads. It does not change schema tables, document slots/paths, write access, lifecycle RPCs, homework response access, or staff/Admin document behavior. Generated database types were refreshed from DEV with the valid stored Supabase CLI session after excluding a stale invalid token override.
- The runtime failure was caused by selecting nonexistent `homeworks.title` (DEV Postgres error `42703`). The query now uses the actual Homework schema and selects the signed-in partner's progress by `profile_id` in the server query and result mapping; the other partner's private progress is not displayed. No title field or migration was added, and no participant response editor was added. The existing session association remains `homeworks.session_id`. No unrelated document, Session, Admin, or Counseling Team behavior changed.
- Counseling Team case detail at `/workspace/cases/[caseId]` now includes a `Current Homework` card between Current Session and Next Meeting. When an assignment exists, it shows `Session N Homework` and each current partner's status matched by profile ID; with no assignment it shows `No homework assigned yet.` Care-team access continues to use the existing authorized progress read. The query selects progress `profile_id` and `status` only, never written responses; existing lifecycle completion gating remains unchanged. The Counseling Status/Team/Prepare & Enrich rail is unchanged.
- Validation under Node `v26.8.2`: focused Couple Workspace test (3), `npm run typecheck`, `npm run lint`, full `npm test` (98 files / 523 tests), `npm run build`, and `git diff --check` passed for the October 7 layout refinement. Browser verification was not performed (`agent-browser` unavailable). No schema, RLS, migration, or database changes were made for this layout-only task; DEV and PROD were not modified. The right rail remains Counseling Status, Counseling Team, then final Prepare & Enrich. Worktree remains uncommitted with earlier changes preserved. Exact next step: review `/workspace` in an authenticated browser at desktop and mobile widths, confirming the two-column card pairing and unchanged right rail.
- October 7 staff Counseling Case right-rail refinement: removed the Counseling Team card from the shared staff-facing `/workspace/cases/[caseId]` detail presentation. The rail now contains only Counseling Status followed by the existing Prepare & Enrich card, with natural stacking and existing responsive layout. Couple Workspace Counselor display and secure contact routes/data access remain unchanged. Focused case-detail and Couple Workspace regression tests, `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v26.8.2`; browser verification was not performed. No database, migration, RLS, RPC, authorization, or route changes. Worktree remains dirty/uncommitted with prior work preserved; nothing committed or pushed. Exact next step: authenticated browser review of staff case details at desktop and mobile widths, and confirm Couple Workspace still shows the linked Counselor.
- October 7 DEV Coach case visibility/name investigation (read-only): the exact “Pending Couple invitation” case is counseling case `2b7a6530-156a-4de1-aa5a-d901c88708dd` (`matched`, created Sep 11, updated Sep 17), coupled to group `23f1ac05-7090-4081-bf42-78f92a8da5d1`. It has two active Couple memberships (profiles John Smith and Stacy Miller), both accepted Couple invitations, and no intake request linked through `intake_requests.invited_group_id`; it is not an unaccepted invitation, orphan, or missing-couple record. Its active `coach` assignment is `ad1b803b-9bbc-4961-bee7-6313fd184895` to Coach Team Two `72bb363b-6c4a-4a29-8a29-3c2c0319b1ec`; its active Counselor-of-record assignment is to Counselor Team `74dd5b29-149f-4cd4-91e9-5c2c8e337b3d`. The displayed Admin team James & Gina Jacobs is a different group, `5367e55e-0753-457c-b1b5-054debc5f8c8`, with no active assignment to this case (its case assignment history is ended). Admin “Assigned Couples” reads only active `case_assignments.assignment_type = counselor`; `/workspace` selects RLS-visible cases, and `current_user_can_access_case` permits an active `coach` assignment. Thus a Coach Team can see an operational Coach-assigned case while its Admin Assigned Couples count remains zero, but the reported James & Gina vs case association is not present in current DEV. Authenticated read checks confirmed `TEST_COACH` (active James & Gina member) cannot see this case, while `TEST_COACH_3` (active member of Team Two) can. For the latter, the `counseling_cases` row is visible but the nested Couple `groups` join is null and a direct Couple-group read is denied by RLS. `coupleDisplayName` then falls back to the stored group name “Pending Couple invitation”; this is generic fallback text, not invitation state. Existing couple names, membership and accepted invitation records exist. No code, DEV data, schema, migration, RLS, RPC, or generated type was changed. Validation was source/migration inspection and targeted read-only DEV/PostgREST checks; tests/build were not run for this investigation. Worktree remains dirty/uncommitted with prior work preserved. Exact next step: confirm which Coach login/team and browser session produced the report; if Couple names/photos should be visible to operationally assigned Coaches, approve a narrow case-scoped authorization/projection design before implementation, rather than widening general group/profile RLS. Nothing committed or pushed.
- October 7 Coach Workspace identity and empty-state implementation and DEV validation: staff workspace no longer depends on RLS-filtered nested Couple group/profile joins. It requests the narrow `get_counseling_workspace_couple_identity(target_case_id)` security-definer projection for one case, returning only Couple/group/profile IDs, first/last names, and photo paths, gated by existing `private.current_user_can_access_case`; general group/profile RLS remains unchanged. The identity mapper requires exactly two complete members and never substitutes “Pending Couple invitation”; incomplete authorized identity is logged with case ID and preserves the friendly unavailable error. Coach `/workspace` with zero visible assigned cases shows `Pending couple assignment` and `No couple has been assigned to you yet.` with no case card, action, progress, or link. Counselor/Campus Lead empty state, case routes/actions, existing Couple Workspace, Admin assignment semantics, and other authorization remain unchanged. After explicit approval, migration `20261007110000_counseling_workspace_couple_identity.sql` was applied to DEV `lctkqjjkhpyootwvttvj` only. Supabase types were regenerated from DEV and now contain the RPC signature; the temporary local RPC typing cast was removed. Authenticated DEV checks: assigned Coach returned two complete names and two signable photo paths; an unrelated Coach received zero identity rows for the case. Counselor, Campus Lead, Admin, and both Couple test accounts retained their expected RLS-visible cases and each received two identity rows per visible case. The configured Coach test accounts all currently see an assigned case; an unassigned active Coach team exists in DEV but no configured login is exclusive to it, so the live authenticated unassigned-account check could not be performed without changing DEV data. Focused UI tests verify the unassigned state and no fake card/action/progress/navigation. Focused tests passed (25 tests across 7 files), `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v26.8.2`. Local authenticated browser verification was not available/performed. PROD was untouched. Worktree remains dirty/uncommitted with prior work preserved; nothing committed or pushed. Exact next step: review `/workspace` in a local authenticated browser as an assigned Coach and obtain an unassigned Coach login for the empty-state check.
- October 7 secure counseling contact drill-downs and Couple Workspace layout finalization: added the full-width, read-only `/workspace/contacts/[caseId]/[groupId]` route using the existing People detail member presentation. It has no right rail, Admin actions, uploads, assignment controls, or edit controls. Couple breadcrumb context is `Workspace / Counselor / [Counselor]`; care-team context is `Workspace / Sessions / [Couple or role] / [contact]`.
- Added the narrow, case-aware `get_counseling_contact_group` Security Definer RPC and `get_current_couple_case_counselor` projection. A Couple can retrieve only the two members of its single most-recent active Counselor-of-record assignment; authorized care-team users can retrieve the Couple or active case-assigned teams; unauthorized, unrelated-case, and anonymous callers receive no contact rows. The functions return only the read-only contact fields needed by the page, grant only `authenticated`, and preserve all existing RLS rather than broadening general profile/group access. Migration `20261007100000_counseling_contact_drilldowns.sql`, followed by `20261007101000_tighten_couple_contact_counselor.sql`, was applied to DEV project `lctkqjjkhpyootwvttvj`; no PROD or unrelated database change was made. Generated types were refreshed from DEV after the new RPC signatures.
- Couple Workspace shows only a linked Counselor entry in Counseling Team. The counseling case detail’s assigned Campus Lead, Coach, and Counselor entries link to their authorized read-only contact pages; unassigned entries remain plain text. The Couple header links to the authorized Couple contact page. Session lifecycle, homework, documents, Couple Version behavior, Coaches rail, Admin People & Teams behavior, and existing case-detail rail order remain unchanged. As of the later October 7 alignment refinement below, cards in each two-column content-grid row stretch to match that row’s tallest card.
- Validation under Node `v26.8.2`: focused contact/Couple Workspace/case-detail/route tests (18), `npm run verify:supabase` (DEV HTTP 200), `npm run verify:counseling-contacts` (authenticated DEV allow/deny contract and fixture assignment restoration), `npm run typecheck`, `npm run lint`, full `npm test` (100 files / 526 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed (`agent-browser` remains unavailable). The project’s `setup:test-users` prerequisite was attempted for the DEV verifier but stopped on pre-existing Campus Lead test-fixture membership conflict; the existing fixtures were nevertheless sufficient for the verifier. Worktree remains uncommitted and includes prior approved work.
- October 7 Counselor `/workspace` runtime regression: confirmed that `features/counseling-contacts/queries.ts` detached `supabase.rpc` into standalone functions, losing the Supabase client context and causing `Cannot read properties of undefined (reading 'rest')`. Both contact RPC calls now invoke `supabase.rpc(...)` directly and use the generated RPC types. The existing `/workspace` route already branches on active workspace before loading Couple data, so no role-routing change was needed: Counselor, Coach, and Campus Lead remain in Sessions; Couple remains in Couple Workspace; Admin behavior is unchanged. Added a bound-client regression test for both RPC helpers and a Counselor route assertion that Couple data is not loaded. Focused tests (7 files / 16 tests), `npm run typecheck`, `npm run lint`, and `git diff --check` passed under Node `v26.8.2`. No database, migration, RLS, RPC, generated-type, or authorization change was made; DEV and PROD were untouched. Browser verification remains outstanding because `agent-browser` is unavailable. Worktree remains uncommitted with all earlier approved changes preserved.
- October 7 card alignment, grouped avatars, and contact-link verification: removed the Couple Workspace `items-start` regression and made the Couple Workspace and Counseling Case two-column content grids explicitly stretch, with each card filling its own grid cell. Cards now match the tallest card only within their responsive row/group; mobile stacking and unrelated right rails remain natural and independent. Added the shared `GroupedAvatars` presentation and reused it for Couple Workspace headers, Counseling Session cards, and Counseling Case headers. Multiple people use consistent 64px circles, two-pixel white separation, `-space-x-3` overlap, and deterministic stacking; one person remains an unstacked circular avatar. The reported Coach/Counselor 404 was not reproducible in the authenticated DEV Counselor session: the Counseling Case page rendered hrefs in `/workspace/contacts/[caseId]/[groupId]` order with the actual case UUID and assigned `groups.id`; both linked routes returned rendered team/member details. Route structure, link generation, RLS/RPC, and authorization were left unchanged because the inspected identifiers matched their contracts. The earlier check was incomplete: it manually constructed URLs from DEV rows and checked only HTTP status, rather than extracting hrefs from the rendered case page and checking the destination content. Added a focused route regression for both Coach and Counselor params while retaining the not-found guard for unavailable contacts. Validation under Node `v26.8.2`: focused tests (4 files / 17 tests), `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No browser automation was available, so the user's currently reported browser 404 remains unconfirmed in their exact session. No database or environment changes; PROD untouched. Worktree remains uncommitted with earlier approved changes preserved. Exact next step: retry both links in the same Counselor browser session; if either still 404s, capture the full address-bar URL and confirm whether it is a Next 404 page or an authorization redirect so the specific session/case can be reproduced.
October 6, 2026 — Couple Detail rails and Counselor Copy label
- Reorganized the existing Counseling Team case detail for a couple into a responsive main-content/rail layout with exactly three cards: Counseling Status, Counseling Team, then Prepare & Enrich. Prepare & Enrich always occupies the bottom rail position; when no Counselor document exists, it shows the compact `No document uploaded.` state rather than disappearing. No tabs were added. Progress remains in the primary case-detail content, with existing couple header, breadcrumb, Session, homework, meeting, and lifecycle behavior preserved.
- The read-only Counseling Team card shows current Campus Lead, Coach, and Counselor relationships using the existing case-assignment data. A narrow DEV migration `20261006100000_counseling_case_team_read_access.sql` was required because the pre-existing case-assignment/group RLS policies did not permit Campus Lead-aware counseling-team reads of those relationship names. It grants only users already authorized by `private.current_user_can_manage_counseling_case` the active assigned-team data needed for this card; no document, Resource Library, Session Material, or management permissions changed.
- The counseling-team rail now displays the Counselor document as `Counselor Copy` and continues to use the existing protected View/Download route. This is a display-label-only change: the `counselor` document slot, query, storage path, RLS, and document behavior are unchanged. Couple Version is neither selected into the counseling-team document query nor rendered. Admin Couple profile upload/replace behavior for both slots remains unchanged. As of October 7, the main detail content also includes the separate Current Homework partner-status card described above; its addition does not change the right rail or response privacy.
- The earlier Couple Workspace searches targeted the participant-facing `couple` role, whose `/workspace` remains a placeholder. This clarified task targets the existing Admin Couple group detail at `/people/[recordId]`. Its rail now renders Counseling Status, Counselor, then the existing Prepare & Enrich manager. The manager is the final card; its content, `Counselor Version`/`Couple Version` labels, Upload/Replace controls, queries, and permissions are unchanged. No new Couple UI was created.
- The Counseling Team case-detail rail remains Counseling Status, Counseling Team, then Prepare & Enrich with the `Counselor Copy` label. The Couple Version remains absent from that view and available only in the Admin manager. The October 7 Homework status card is in the main content, not the rail; it adds no response data or authorization behavior.
- Added a focused Admin Couple detail presentation test for rail order and existing document labels/actions. Validation under Node `v26.8.2`: focused Admin/Prepare & Enrich/Counseling Team tests (7), `npm run typecheck`, `npm run lint`, full `npm test` (95 files / 512 tests), `npm run build`, and `git diff --check` passed. No database changes were made. Browser verification was not performed. Worktree remains uncommitted and includes previous Counseling Sessions/Prepare & Enrich changes. Exact next step: authenticated browser review of the Admin Couple rail order, Admin upload/replace controls, and unchanged Counseling Team rail and Counselor Copy access.
October 5, 2026 — Prepare & Enrich case-document slots
- Extended the existing case-scoped `assessment_documents` model and private `assessment-documents` bucket rather than Resource Library. Each counseling case now has at most one current `counselor` document and one current `couple` document, enforced by an explicit slot constraint and unique case/slot index. Replacing a slot atomically replaces its current metadata and removes the prior stored object after the replacement succeeds; no document-history UI was added.
- Admin/Super Admin manage both slots from the existing Admin Couple profile. The Counselor Version is exposed through a protected download route on the existing Counseling Workspace Couple Detail for authorized Campus Lead, Coach, and Counselor users. The Couple Version is separately stored, never selected for counseling-team presentation, and reserved for the deferred future Couple Workspace UI.
- DEV migrations `20261005100000_prepare_enrich_document_slots.sql` and `20261005100500_fix_prepare_enrich_care_team_access.sql` were applied to `lctkqjjkhpyootwvttvj`; generated Supabase types were regenerated from DEV. RLS and storage policies now permit Admin/Super Admin both slots, while authorized Campus Lead, Coach, and Counselor users may read only the Counselor slot through the existing Campus Lead-aware care-team predicate. Counseling-team roles cannot modify documents; no broad authenticated access was added. Resource Library and Session Materials remain separate and unchanged.
- Validation under Node `v26.8.2`: focused Prepare & Enrich/Couple Detail tests (6), `npm run typecheck`, `npm run lint`, full `npm test` (94 files / 509 tests), `npm run build`, `git diff --check`, and `npm run verify:supabase` (DEV HTTP 200) passed. Browser verification was not performed. Worktree remains uncommitted and includes earlier Counseling Sessions work. Exact next step: USER AUTHENTICATED BROWSER REVIEW of Admin Couple upload/replace for both slots and authorized Campus Lead/Coach/Counselor Counselor-Version download; confirm Couple Version remains absent from counseling-team views.
October 5, 2026 — Correct Campus Lead Coach final-row hit area
- Replaced the extended viewport and oversized final-row pseudo-element with a structural link layout. The final Coach link itself owns the remaining bottom space; its fixed-height inner content wrapper preserves Coach name and chevron placement. The preceding Coach link retains its original bounds, so row hit areas do not overlap and hovering one link affects only that row. The final link background reaches the card edge without a separate strip.
- Whole-row navigation to `/workspace/coaches/[coachId]`, keyboard focus, accessible labels, decorative non-interactive chevron, content alignment, and Admin People & Teams menu mode remain unchanged. No database/schema/RLS/RPC changes; PROD untouched.
- Validation under Node `v26.8.2`: focused `features/people/relationship-card.test.ts` (2 tests), `npm run typecheck`, `npm run lint`, full `npm test` (91 files / 505 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. Worktree remains uncommitted and retains earlier Counseling Sessions changes. Exact next step: USER BROWSER REVIEW of separate first/final Coach hover and click bounds, final-row fill to card bottom, unchanged text/chevron alignment and sizing, and Admin menu behavior.
October 5, 2026 — Align Campus Lead Coach row hover with card content
- Extended the Campus Lead Coach list viewport through the card's existing `p-4` inset and matched row link padding, so hover background reaches both card content edges while Coach name and secondary text stay aligned with the Coaches heading. Chevron remains 16px inside the right edge. The fixed row height and spacing are unchanged; no rounded corners, added border, or shadow were introduced.
- Whole-row navigation, visible focus, accessible label, decorative non-focusable ChevronRight, destination, Coach authorization, and Admin People & Teams menu behavior remain unchanged.
- Validation under Node `v24.21.0`: focused tests (4), `npm run typecheck`, `npm run lint`, full `npm test` (91 files / 505 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Worktree remains uncommitted and contains earlier Counseling Sessions changes. Exact next step: USER BROWSER REVIEW of full-width row background, heading-aligned text, right chevron inset, focus state, and row spacing.
October 5, 2026 — Campus Lead Coach rail whole-row navigation
- Made each Campus Lead Coach row a single full-width link to `/workspace/coaches/[coachId]`, labeled `View details for [Coach Name]`. The Coach name, campus text, whitespace, and decorative chevron all sit inside the same target; the row has the hover treatment and visible focus state. `ChevronRight` is decorative and not separately focusable.
- Retained the existing minimal `ChevronRight` styling (`size-4 text-text-muted`) from `features/session-builder/session-material-editor.tsx`. The repository contains no component explicitly named Catalog. No shared component extraction was needed. Generic `RelationshipCard` defaults to its existing MoreVertical menu for Admin People & Teams; that behavior remains unchanged.
- Coach detail route and Campus Lead assignment authorization remain unchanged. Validation under Node `v24.21.0`: focused tests (8), `npm run typecheck`, `npm run lint`, full `npm test` (91 files / 505 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Worktree remains uncommitted and contains prior Counseling Sessions changes. Exact next step: USER BROWSER REVIEW of whole-row hover/focus, clicks across name/campus/empty space/chevron, and direct Coach detail navigation; confirm Admin People & Teams still shows its action menu.
October 5, 2026 — Remove Counseling Coaches directory; make breadcrumb context static
- Removed the standalone `/workspace/coaches` directory page and its route-only presentation/tests. The Campus Lead Coaches rail remains on `/workspace` and continues to link assigned teams to `/workspace/coaches/[coachId]`.
- The retained Coach detail breadcrumb is `Workspace / Coaches / [Coach Name]`: Workspace links to `/workspace`; Coaches is static contextual text because no Coaches parent destination exists; Coach name is static current page. Shared breadcrumb current-page markup is now a plain current-location span without link roles, and People breadcrumb items explicitly distinguish an optional static context segment from the current page.
- The Coach detail route still requires active Campus Lead workspace and confirms the Coach is in that Lead's assigned scope before loading the read-only detail foundation. Admin/Super Admin People & Teams breadcrumb behavior and Workspace / Sessions / Couple breadcrumbs are preserved.
- Validation under Node `v24.21.0`: focused tests (26), `npm run build` (route list includes `/workspace/coaches/[coachId]` and excludes `/workspace/coaches`), `npm run typecheck`, `npm run lint`, full `npm test` (91 files / 504 tests), and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Worktree remains uncommitted and includes earlier Counseling Sessions changes. Exact next step: USER AUTHENTICATED BROWSER REVIEW of the rail-to-Coach detail flow and the static Coaches breadcrumb context.
October 5, 2026 — Application breadcrumb audit and Counseling Coach context correction
- Audited all breadcrumb renderers and route usages: shared UI breadcrumbs on Counseling case detail and Session Builder, plus the People & Teams trail builder/detail page. Top-level routes intentionally remain without breadcrumbs. Parent items are linked where destinations exist; current items and contextual labels are static.
- Corrected the Campus Lead Counseling Workspace Coaches rail. Its detail links use `/workspace/coaches/[coachId]` and breadcrumbs read `Workspace / Coaches / [Coach Name]`. The initial follow-up implementation added `/workspace/coaches` as a parent page; browser review rejected that destination, and the page has since been removed. `Coaches` is now a static contextual label.
- The new Workspace Coach routes require the active `campus_lead` workspace and independently verify that the requested Coach belongs to that Campus Lead's assigned Coach list before loading the existing read-only detail presentation. No Admin actions or broader People access are introduced. `/workspace/cases/[caseId]` remains `Workspace / Sessions / [Couple Name]`, with both parents linked to `/workspace` and the Couple static. Admin and Super Admin People & Teams pages retain `People & Teams / ...` and their existing hierarchical People trails; Session Builder retains its own builder context.
- Added representative breadcrumb, route, parent-destination, and authorization-boundary tests. Validation under Node `v24.21.0`: focused tests (28), `npm run typecheck`, `npm run lint`, full `npm test` (93 files / 506 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Worktree remains uncommitted and includes prior Counseling Sessions changes. Exact next step: USER AUTHENTICATED BROWSER REVIEW of the Campus Lead Coaches rail → Coach detail flow, parent links, existing couple detail breadcrumbs, and Admin People & Teams breadcrumbs.
October 5, 2026 — Counseling Workspace spacing and Coaches rail alignment
- Reduced the gap between the Workspace description and couple cards and aligned the Campus Lead Coaches rail with the top of the Session card grid on desktop. The rail continues below all Session cards on smaller screens; the existing card grid, Coaches rail content, and responsive two-column workspace are preserved.
- Added focused presentation assertions for the tighter spacing, desktop card-row alignment, and mobile rail order. No Session behavior, data, authorization, database/schema/RLS/RPC, Resource Library, or Admin People & Teams behavior changed.
- Validation under Node `v24.21.0`: focused tests (6), `npm run typecheck`, `npm run lint`, full `npm test` (90 files / 500 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No DB changes; PROD untouched. Worktree remains uncommitted and includes prior Counseling Sessions changes. Exact next step: USER AUTHENTICATED BROWSER REVIEW of the reduced header-to-card spacing and desktop rail/card alignment, confirming mobile order remains intact.
October 5, 2026 — Counseling Workspace rail and couple-card hover refinement
- Reworked the Campus Lead Sessions layout so the Workspace eyebrow and Coaches card occupy the same top row on desktop. The session cards begin in the next main-column row. On smaller screens the card grid stays before the Coaches rail; this uses explicit responsive grid placement without fixed pixel offsets.
- Added a restrained clickable-card hover treatment: light blue tint, accent border, slightly stronger shadow, and one-pixel lift. Keyboard focus remains distinct through a visible accent border/ring and focus background.
- Couple card destination, controls, card content, lifecycle, coach authorization/data, breadcrumbs, and two-column maximum remain as previously implemented.
- Added focused layout and interaction-style assertions. Validation under Node `v24.21.0`: focused tests (23), `npm run typecheck`, `npm run lint`, full `npm test` (90 files / 500 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Worktree remains uncommitted and includes prior Counseling Sessions work. Exact next step: USER AUTHENTICATED BROWSER REVIEW of desktop rail alignment, narrow-screen order, hover, and keyboard focus.
October 5, 2026 — Counseling Workspace couple drill-down and breadcrumbs
- Aligned the Campus Lead Coaches rail with the Sessions content using the existing responsive Workspace layout; the rail remains stacked beneath the main content below the desktop breakpoint and retains the existing People & Teams `RelationshipCard` treatment.
- Made each Sessions couple card keyboard-focusable and clickable through an accessible full-card link to `/workspace/cases/[caseId]`. The existing scheduling and closure controls remain separate, higher-stacking interactive elements, so their clicks do not navigate away.
- Added the counseling-team detail route `app/workspace/cases/[caseId]/page.tsx`. It is a small case foundation rather than an Admin People & Teams clone: couple name, paired profile photos/fallbacks, counseling status, current Session/homework, next meeting, and progress.
- The route reuses `getCounselingSessionCards` through a single-case lookup. Existing `counseling_cases` RLS filters the source query for the signed-in care-team member; absent or unauthorized IDs return `notFound()`. Campus Lead, Coach, and Counselor workspaces are admitted; other active workspaces redirect to `/workspace`.
- Reused the shared UI breadcrumb primitives for `Workspace / Sessions / [Couple]`; the first two navigate to `/workspace` because Sessions is the default Workspace view, and the current couple is non-clickable.
- Added focused card-navigation, detail-page, route authorization, photo fallback, breadcrumb, and existing Session-state tests. Validation under Node `v24.21.0`: focused tests (24), `npm run typecheck`, `npm run lint`, full `npm test` (90 files / 499 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Worktree remains uncommitted with prior Counseling Sessions milestone changes. Exact next step: USER AUTHENTICATED BROWSER REVIEW of card drill-down, keyboard navigation, action isolation, detail breadcrumbs, and Campus Lead rail alignment.
October 2, 2026 — Counseling Workspace couple grid simplification
- Removed the Sessions `Search couples` field and its local search/filter state. Cards now begin below the Sessions description, followed by the existing grid spacing; empty state now reports that no assigned cases are available.
- Capped the Sessions grid at two columns: one column by default and two at the existing `sm` breakpoint. Removed the three-column breakpoint so the cards use more width in both Coach/Counselor content and the Campus Lead main column.
- Preserved all Session card content, partner photos/fallbacks, lifecycle actions, and the Campus Lead Coaches rail/layout/authorization without changing data access or behavior.
- Added/updated focused presentation and route assertions for absent search UI, the maximum two-column layout, card status/homework/meeting/progress/action data, lifecycle actions, and Coaches rail presence.
- Validation under Node `v24.21.0`: focused tests (23), `npm run typecheck`, `npm run lint`, full `npm test` (88 files / 494 tests), `npm run build`, and `git diff --check` passed. Browser verification was not performed. No database/schema/RLS/RPC changes; PROD untouched. Git work remains uncommitted and includes prior Counseling Sessions milestone files. Exact next step: USER REVIEW of the simplified Workspace at `/workspace`, especially two-card widths beside the Campus Lead Coaches rail.
October 2, 2026 — Counseling Workspace landing structure and Campus Lead Coaches rail
- Corrected the counseling-team side navigation to identify `/workspace` as `Workspace`; Sessions remains the default primary content within it for Campus Lead, Coach, and Counselor. No competing Sessions route or lifecycle behavior was introduced.
- Added a Campus Lead-only responsive two-column layout: the existing Sessions couple-card grid remains the primary column, while the existing People & Teams `RelationshipCard` renders an informational Coaches rail. On smaller viewports, the rail stacks beneath Sessions. Coach and Counselor continue to open directly to Sessions with no new rail behavior.
- The rail uses the existing `campus_lead_coach_assignments` relationship. Its server query first resolves the signed-in user’s active Campus Lead team, then reads only that team’s active Coach rows through existing authenticated RLS; it does not add grants, policies, schema, or an assignment control. The rail intentionally has no footer, so Admin-only `Assign Coach` and the Admin-only eligible-coach empty message are absent.
- Added focused route, workspace presentation, and navigation tests alongside the existing Sessions lifecycle/presentation tests. Validation under Node `v24.21.0`: focused tests (21), `npm run typecheck`, `npm run lint`, full `npm test` (88 files / 492 tests), `npm run build`, and `git diff --check` passed. The initial parallel typecheck overlapped Next generated-type refresh and failed on transient missing `.next/types` files; it passed after build. Browser verification was not performed. No database changes; PROD untouched. Current Git state is uncommitted and retains prior Counseling Sessions work. Exact next step: USER AUTHENTICATED BROWSER REVIEW of Campus Lead Workspace (assigned Coaches rail and responsive layout) and Coach/Counselor Workspace (Sessions-only layout).
October 2, 2026 — Counseling Sessions responsive couple-card refinement
- Refined only the `/workspace` Sessions presentation into responsive one-column mobile, two-column tablet, and three-column wide-screen cards, with consistent stretch height and bottom-aligned primary actions. Search and all existing action/state logic remain intact.
- Reused existing partner profile `photo_path` data and the People detail `getProfilePhotoUrl` signed-photo helper. Paired circular images use the existing People placeholder convention when either photo is missing. No People & Teams pages were changed.
- Added focused presentation tests for the grid breakpoints, both photo slots/missing-photo fallback, Initial Meeting, current Session/incomplete Homework, and final Session/Close Case behavior. Existing state model tests remain in place.
- Validation under Node `v24.21.0`: focused Counseling Sessions tests (13), `npm run typecheck`, `npm run lint`, full `npm test` (86 files / 487 tests), `npm run build`, and `git diff --check` passed. The first typecheck overlapped build generation of `.next/types` and failed on transient missing generated files; it passed on rerun after build completion. Browser review was not performed because `agent-browser` is not installed. No database changes or migrations were made. Current Git state includes this uncommitted refinement plus pre-existing uncommitted Counseling Sessions files. Exact next step: USER AUTHENTICATED BROWSER REVIEW of the responsive Sessions couple-card grid, photos/fallbacks, and state-driven actions at `/workspace`. PROD untouched.
October 2, 2026 — Counseling Team Workspace: Sessions (DEV migration applied; browser review pending)
- Added `features/counseling-sessions/` with a shared pure state model, server query boundary, Server Actions, and a card-first searchable Sessions workspace. Campus Lead, Coach, and Counselor now use this workspace at `/workspace`; Couple remains excluded.
- Session state is action-exclusive: unscheduled/scheduled Initial Meeting, incomplete Homework → Reschedule, completed Homework → Schedule Next Meeting, and completed final Homework → Close Case. The final Session never offers Schedule Next Meeting; rescheduling only updates meeting details.
- Added migration `20261002100000_counseling_sessions_workspace.sql`: per-case in-person meeting rows; Security Definer schedule/close RPCs; automatic published-Homework activation; progression/closure validation; and narrow care-team read policies. It intentionally does not touch Prepare & Enrich, Resource Library, or the Admin Couple detail page.
- DEV reconciliation: remote-only timestamp records were the same chronological Homework, Session persistence, and Session Resource Library migrations applied under execution-time identifiers. The DEV-only migration ledger was repaired by reverting those 13 timestamp records and recording their matching canonical local migration versions as applied. `supabase migration list --linked` now reports a complete local/remote match, and `20261002100000` was then applied to project `lctkqjjkhpyootwvttvj`.
- Validation completed under Node `v24.21.0`: focused Sessions tests (5), `npm run typecheck`, `npm run lint`, `npm test` (84 files / 479 tests), `npm run build`, `git diff --check`, and `npm run verify:supabase` all passed.
- Generated types are now regenerated from DEV. The inherited `SUPABASE_ACCESS_TOKEN` override was invalid and shadowed a valid stored Supabase CLI session; running Supabase CLI commands with only that environment variable unset used the stored session successfully. The generated diff is limited to `case_session_meetings` (including the case/profile/session relationships) and the `schedule_case_session_meeting` / `close_counseling_case` RPC signatures. No credentials were modified or exposed.
- Validation after type generation completed under Node `v24.21.0`: focused Sessions tests (5), `npm run typecheck`, `npm run lint`, `npm test` (84 files / 479 tests), `npm run build`, `git diff --check`, and networked `npm run verify:supabase` all passed. There is no Counseling Sessions rollback-only verifier in the repository. Browser verification remains outstanding; exact next step: USER BROWSER REVIEW OF COUNSELING TEAM WORKSPACE across authenticated Campus Lead, Coach, Counselor, and Couple flows. No commit was made; PROD untouched.
October 2, 2026 — Counseling Sessions runtime error correction
- Browser review exposed `Counseling Sessions are unavailable`. Direct authenticated DEV reproduction isolated `assignmentsResult` as the failing query, with Postgres error `42P17` (infinite RLS recursion on `homework_assignment_revisions`). `caseResult`, `sessionsResult`, and `meetingsResult` were successful.
- Root cause: the Sessions care-team progress policy traversed Homework revisions while existing participant-read policies on assignments/revisions traversed revisions/progress. PostgreSQL evaluated the combined policy graph recursively for the nested `homework_assignments → homework_assignment_revisions → homework_participant_progress` select.
- Added DEV migrations `20261002110000_fix_counseling_sessions_progress_policy.sql` and `20261002120000_fix_homework_read_policy_recursion.sql`. They use narrowly scoped private Security Definer eligibility helpers and replace only the recursive policy expressions; care-team, participant, and Admin/Super Admin access semantics remain unchanged. Both migrations were applied to `lctkqjjkhpyootwvttvj`; no unrelated schema, Resource Library, Session Material, or People & Teams changes were made.
- `getCounselingSessionCards` now safely logs only query label/code/message server-side while preserving the browser-safe generic error. Focused tests now cover diagnostics and RLS migration intent. Authenticated DEV reproductions confirm all four workspace queries work for Campus Lead, and the nested Homework query works without errors for Campus Lead, Coach, and Counselor.
- Validation under Node `v24.21.0`: focused tests (8), `npm run typecheck`, `npm run lint`, `npm test` (85 files / 482 tests), `npm run build`, `git diff --check`, and `npm run verify:supabase` passed. Local browser automation was unavailable because `agent-browser` is not installed; do not treat this as browser approval. No commit was made; PROD untouched. Exact next step: USER BROWSER REVIEW OF COUNSELING TEAM WORKSPACE.
1. Project Overview & Goals
Product purpose
The application is an internal and participant-facing platform for Resonate Movement’s pre-engagement / marriage counseling ministry.
The system is intended to support the full counseling workflow:
- Admins receive and manage couples.
- Admins pair couples with Coaches and Counselors.
- Authors/Admins build reusable Session content and Homework.
- Counselors eventually assign relevant Session material and Homework to individual couples.
- Couples eventually consume reading/resources and complete required Homework.
- Counselors eventually review submitted responses.
- Historical assignments and participant responses must remain stable even when curriculum is revised later.
Resource Library standalone milestone and Session Material Resource Library integration are complete. Homework authoring/Preview and Session Material Video / Link behavior remain unchanged.
Runtime requirement: use Node 24 for project validation.
Core product model
A counseling curriculum consists of Sessions.
A Session is treated in the authoring UI as one document with one visible lifecycle:
- Draft
- Published
Within a Session are two main workspaces:
Session Material
Session Material is now conceptually divided into:
Pages
- Main reading/teaching material.
- Stored internally as the existing rich_text block type.
- Displayed to authors as Page, not Rich Text.
- Each Page has:
  - Title
  - Rich-text body
- Intended to become a participant-facing reading page.
- Preview displays one Page at a time.
Resources
- Supplemental material.
- Existing Video / Link remains, alongside completed Image / Document / Audio / Video library-backed integration.
- Resources are displayed separately from Pages.
- Library-backed blocks reference a stable Resource identity and resolve the current file version; DEV migration and rollback verification passed, and user browser approval is complete.
Homework
Homework is content that participants will eventually complete.
Supported authoring block types:
- Rich Text
- Video / Link
- Long Answer
Homework maintains a sophisticated independent version/history model underneath the Session UI because assignments and participant responses must remain historically correct.
The authoring UI deliberately does not expose a competing Homework Draft/Published badge. The visible lifecycle belongs to the Session as a whole.
Long-term participant model
The eventual participant experience should allow couples to:
- view assigned Session Pages;
- open supplemental Resources;
- read Homework content;
- answer Long Answer questions;
- save progress;
- submit Homework;
- retain access to appropriate Session materials.
Long Answer responses are private/individual.
Partner answer visibility has intentionally been deferred.
Future selective Session Material assignment
A major future product decision has already been made:
Counselors will eventually be able to choose which Session Pages to send to a particular couple.
Different couples may receive different subsets of the Session reading material.
Example future assignment:
Select reading pages

☑ Communication and Expectations
☑ Conflict Resolution
☐ Financial Expectations
☑ Preparing for Marriage
This feature is not implemented yet.
Important architectural constraint:
- Future assignments should reference the stable identity of a Page, not its visual position.
- Reordering Pages must not change the Page identity.
- Do not redesign the existing Page model in a way that destroys stable identity.
Resources may eventually be selected independently as well, but that has not yet been fully designed.
2. Current System Architecture / Tech Stack / Writing Style Rules
Core technology
- Next.js App Router
- React
- TypeScript
- TailwindCSS
- ShadCN UI
- Supabase
  - Authentication
  - PostgreSQL
  - RPCs
  - RLS
- Tiptap rich-text editor
- dnd-kit for accessible drag/drop
- Sonner for toast notifications
- Node 24 is the required project runtime
Use Node 24 for final validation whenever available.
Supabase environments
Marriage Ministry DEV
Project reference:
lctkqjjkhpyootwvttvj
Configured MCP:
supabase-marriage-ministry-dev
Features:
database,development
This environment is safe for approved development migrations/verifiers.
PROD
PROD must remain untouched unless the user explicitly approves production work.
Do not:
- apply migrations to PROD;
- run destructive PROD operations;
- deploy to PROD;
- inspect or mutate PROD unnecessarily.
Supabase MCP authentication
The Marriage Ministry DEV MCP OAuth session previously expired.
The UI Reconnect button failed because Codex dynamic registration attempted unsupported OAuth scopes.
Authentication was restored successfully with explicit Supabase-supported scopes.
After authentication, a live read-only list_migrations MCP call succeeded against:
lctkqjjkhpyootwvttvj
Therefore the Marriage Ministry DEV MCP connection is currently known to work.
There was a separate stale OAuth refresh warning for:
supabase-awhs-inventory-dev
That is unrelated to Marriage Ministry and should not be accessed during Marriage Ministry tasks.
Generated Supabase types
Primary generated file:
types/database.generated.ts
Rules:
- Never hand-edit generated types just to make a task compile.
- If an RPC type is unavailable or generator nullability is wrong, isolate the accommodation in one narrow adapter.
- Do not spread casts through UI components.
Known adapter:
features/session-builder/save-session-state.ts
This currently isolates type accommodations for Session/ Homework save RPCs.
Repository engineering rules
The repository follows:
- DRY
- KISS
- YAGNI
- short readable functions
- strong reuse
- no speculative abstraction
- no dead files/exports
- no duplicated business logic when an existing implementation already owns the responsibility.
Reuse-first rule now in AGENTS.md
The repo explicitly contains the following policy:
Reuse-first rule: Before creating a new component, helper, hook, validator, editor, card shell, dialog, menu, state utility, or similar abstraction, first inspect the existing codebase for an implementation with the same responsibility. Reuse or extend the existing implementation when practical. Create a separate implementation only when there is a concrete behavioral or domain reason not to share. When a separate implementation is necessary, document the reason in the task handoff. Do not duplicate existing behavior merely to avoid a small refactor.

And:
Prefer extracting a small shared primitive over creating parallel feature-specific copies, but do not force unrelated behaviors into a single over-generalized component.

All future Codex tasks should explicitly follow this rule.
Important reuse decisions already made
These responsibilities are shared:
- RichTextEditor
- rich-text completion validation
- rich-text read-only rendering where appropriate
- rich-text collapsed summary
- VideoLinkFields
- authoring section header
- ShadCN primitives
- client HTTP(S) validation foundation
- page-level dirty/navigation protection
- exact DELETE confirmation helper
- text-field autofocus behavior in dialogs
- relevant reorder helpers
These should remain separate because the domain behavior differs:
- Session Material card wrapper
- Homework card wrapper
- Session state model
- Homework state/version model
- Session dirty comparator
- Homework dirty comparator
- Session persistence
- Homework persistence/versioning
- Session loading/error flow
- Homework loading/error flow
- unsupported Homework block handling
- assignment/history logic
Do not create a giant generic “block editor” or “content card” abstraction.
Coding-agent workflow rules
Before every Codex implementation task:
1. Discuss intended behavior with the user.
2. Wait for explicit approval.
3. Recommend a Codex model/reasoning level.
4. Then provide the Codex prompt.
Do not give an implementation prompt before approval.
Model usage
Cost-conscious defaults:
- Luna-6 Low:
  - tiny fixes
  - Git operations
  - simple presentation changes
- Luna-6 Medium:
  - normal focused UI/state implementation
  - component reuse
  - medium feature work
- Sol-6 Medium:
  - architecture
  - security
  - DB/versioning
  - substantial persistence logic
- Sol-6 High:
  - exceptional/stubborn issues only
Avoid wasting the 5-hour Codex usage window.
Validation discipline
During intermediate passes:
- run focused tests;
- run git diff --check;
- typecheck/lint once when stable;
- avoid repeatedly running:
  - full test suite
  - production build
  - database verifier.
At meaningful milestone gates:
- Node 24
- npm run typecheck
- npm run lint
- npm test
- npm run build
- git diff --check
- npm run verify:supabase when relevant
Do one full regression gate, not repeated broad loops.
Codex handoff standard
Every completed Codex task must end with:
CHATGPT HANDOFF REPORT
Only the final completion report should use that exact heading.
Reports should contain as relevant:
- branch
- files changed
- implementation behavior
- reuse decisions
- validation/tests
- DB effects
- Git status
- commit SHA if applicable
- remaining issues
- PROD confirmation.
Successful tasks should attempt a macOS say completion notification.
Sandbox restrictions sometimes prevent say; that is not considered a feature failure.
Git workflow
For completed milestones:
1. Validate.
2. Inspect complete diff/status.
3. Commit feature branch.
4. Push feature branch.
5. Merge to main.
6. Push main.
7. Delete completed feature branch locally/remotely.
8. Create next feature branch from updated main.
Do not let many completed milestones accumulate without Git synchronization.
UI / UX conventions
General
- Prefer ShadCN components.
- Avoid decorative outlines/rings unless functional.
- Avoid visual clutter.
- Mobile dialogs should use available width appropriately.
- Low-risk actions may live directly in the list/card.
- Destructive operations require deliberate confirmation.
- Keep navigation, lifecycle, and editor-state concepts visually distinct.
Breadcrumbs
Session Builder uses actual ShadCN Breadcrumb primitives.
Breadcrumbs live:
- at the top of the page;
- outside the editor card;
- above the page heading.
Existing Session:
Session Builder / Session N
New Session:
Session Builder / Create a Session
Do not reintroduce the old green SESSION N eyebrow.
Session lifecycle presentation
The Session has one visible lifecycle badge beside:
Edit Session
Draft
- warm restrained amber/gold background
- darker amber/brown text
Published
- soft green background
- darker green text
Do not display separate Draft/Published badges inside Session Material or Homework.
Unsaved state presentation
Unsaved changes is editor state, not lifecycle state.
It belongs near the Session action area.
It is driven by:
sessionDirty OR homeworkDirty
Dialog autofocus rule
App-wide dialog UX rule:
When a modal/dialog opens and contains an editable text field, the first meaningful editable text field receives focus immediately.

Examples:
- destructive DELETE confirmation
- Rich Text link dialog
- text-entry dialogs.
Dialogs without text fields retain normal Radix initial-focus behavior.
This logic is shared through:
components/ui/dialog-focus.ts
and relevant ShadCN dialog/sheet primitives.
3. Key Decisions Made So Far
Roles / permissions
Relevant roles include:
- Super Admin
- Admin
- Author
- Coach
- Counselor
- Couple
Session/Homework authoring is currently limited to:
- super_admin
- admin
- author
Authors do not gain participant answer access merely because they authored the content.
Session authoring model
A Session is edited as one staged document.
No automatic per-block persistence.
New Session
Author can:
- enter Session title;
- build Session Material locally;
- optionally Save Draft;
- directly Publish Session without saving first if valid.
Existing Draft
Author can:
- edit title/material locally;
- Save Changes;
- Publish Session including current staged changes.
Existing Published Session
Author can:
- edit locally;
- Save Changes;
- remain Published.
No requirement to create a new Session version merely because the Session itself is Published.
Session-level actions
Existing Session:
- Discard Changes
- Save Changes
Draft also has:
- Publish Session
Published Session may additionally have:
- Publish Changes
when there is a persisted pending Homework Draft.
New Session:
- Cancel
- Save Draft
- Publish Session
Discard behavior
For an existing Session:
Discard Changes restores both domains to their last persisted baseline:
- Session title/material
- Homework
It:
- makes no DB call;
- stays on the page;
- clears local dirty state.
If a Published Session already has a persisted pending Homework Draft, that Draft is the Homework baseline.
Discard must not:
- delete the saved Draft;
- revert to the previous published Homework version;
- alter assignment history.
Unsaved navigation behavior
Controlled internal navigation while dirty
Use ShadCN AlertDialog:
Discard unsaved changes?
Actions:
- Keep Editing
- Discard Changes
Browser-level exits
Use native beforeunload only for:
- refresh
- tab close
- external document navigation.
Workspace switching
Switching:
Session Material ↔ Homework
must:
- not prompt;
- not save;
- not discard;
- preserve both staged states.
Session persistence
Migration:
supabase/migrations/20260924090000_session_builder_transactional_persistence.sql
RPC:
public.save_session_builder_state(...)
Supports:
- new Draft title-only;
- new Draft with material;
- direct new Publish;
- existing Draft save;
- existing Draft publish with staged changes;
- existing Published save remaining Published.
Reconciliation:
- preserves persisted IDs;
- assigns server IDs to local blocks;
- removes omitted blocks only from current editable Session state;
- keeps contiguous order;
- rejects cross-Session IDs;
- uses row locking.
Rollback-only verifier:
features/session-builder/session-builder-transactional-dev-verification.sql
Homework Foundation
Homework Foundation is already merged and established.
Core tables:
- homeworks
- homework_versions
- homework_blocks
- homework_version_blocks
- homework_assignments
- homework_assignment_revisions
- homework_participant_progress
- homework_answers
- homework_audit_events
Assignment target:
public.counseling_cases
Homework versioning rules
One stable Homework exists per Session.
Lifecycle rules:
- Draft is editable.
- Published but never assigned remains editable.
- Once a published version has been assigned, that version is immutable.
- Editing an assigned version creates/reuses a Draft based on it.
- Publishing that Draft creates the next immutable numbered version.
Existing assignments:
- remain on their original version.
New assignments:
- use the latest published version.
Homework assignment status
Participant progress statuses:
not_started
in_progress
submitted
reviewed
Submitted answers are read-only.
Future care-role Reopen functionality is deferred.
Participant privacy
Responses are individual/private.
Partner answer visibility is deferred.
Safe initial behavior:
- each partner sees only their own answers.
Super Admin emergency Homework operations
Foundation supports:
- unassign preserving history;
- withdraw preserving history and blocking future use;
- force-update one assignment to a newer published version;
- audit events.
Force-update carry-forward
Answer carry-forward is deterministic.
An answer carries forward only when:
- same stable logical block identity;
- exact persisted prompt equality.
No AI/similarity matching.
If changed/new required work is introduced:
- previously Submitted participant may move back to in_progress.
A fully compatible explanatory-only change may preserve Submitted.
Homework Foundation migrations
Applied migrations include:
20260923090000_homework_foundation.sql
20260923211000_homework_foundation_corrections.sql
20260923212000_homework_audit_integrity.sql
20260923215000_homework_answer_integrity.sql
20260923220000_homework_root_authorization.sql
20260923221000_homework_content_history_integrity.sql
20260923223000_homework_participant_history_integrity.sql
20260923224000_homework_relational_integrity.sql
20260923225000_homework_identity_history_integrity.sql
20260923230000_homework_video_url_integrity.sql
These established:
- meaningful Tiptap validation;
- RPC-owned publishing;
- dedicated Homework audit table;
- exact-version Long Answer checks;
- RPC-owned Homework root creation;
- immutable assigned snapshots;
- participant-write protections;
- cross-parent integrity;
- version/assignment identity integrity;
- stricter hosted video URL validation.
Homework DEV verification
Rollback-only Homework Foundation verifier exercised:
- root Draft create/reuse;
- v1 authoring;
- validation;
- publish;
- published-but-unassigned editing;
- assignment reuse;
- immutable assigned content;
- independent participant answers;
- privacy;
- v2 Draft clone;
- stable logical IDs;
- force-update carry-forward;
- historical write rejection;
- unassign;
- withdraw;
- dedicated audit integrity.
Synthetic data rolled back.
Homework Builder decisions
Workspace
Homework is not a top-level navigation item.
It is a workspace inside Session Builder:
Session Material | Homework
Session Material remains the default workspace.
Homework authoring block types
Rich Text
Uses shared Tiptap authoring.
Toolbar:
- Paragraph
- H2
- H3
- Bold
- Bullet list
- Numbered list
- Link
- Undo
- Redo
No Italic.
Link UI supports:
- URL
- Open in new tab
- preservation of selected text.
Video / Link
Fields:
- Title
- URL
- Description
Uses shared:
VideoLinkFields
Homework uses the stricter URL validator matching its DB constraint.
Session Material retains its own applicable URL contract.
Long Answer
Author prompt uses Tiptap.
Participant answer will eventually be a plain long textarea.
Long Answer is required by definition.
Do not add:
- Required toggle;
- optional setting.
Block completion rules
A block may be created empty while being authored.
However, Done must remain disabled until required content is complete.
Rich Text / Page
Requires:
- meaningful non-whitespace Title;
- meaningful Rich Text body.
Empty/whitespace-only Tiptap content is invalid.
Video / Link
Requires:
- meaningful Title;
- meaningful URL;
- meaningful Description;
- valid URL.
Long Answer
Requires:
- meaningful Rich Text prompt.
These validations live in shared authoring logic, not duplicated feature wrappers.
Shared authoring components
Relevant shared code includes:
components/shared/authoring-completion.ts
components/shared/authoring-section-header.tsx
components/shared/rich-text-summary.tsx
components/shared/rich-text-summary-model.ts
components/shared/video-link-fields.tsx
components/shared/destructive-confirmation.ts
features/session-builder/rich-text-block-authoring.tsx
features/session-builder/rich-text-editor.tsx
The exact file organization may evolve, but future work should reuse these responsibilities.
Tiptap Link warning fix
Previously the browser warned:
Duplicate extension names found: ['link']
Cause:
- StarterKit registered Link;
- explicit Link extension was also registered.
Resolution:
- StarterKit Link was disabled;
- the explicitly configured Link extension remains.
Do not reintroduce a second Link extension.
Homework staged editing
Homework changes are local/staged.
Adding/editing blocks does not immediately write to DB.
Stable identities:
- persisted blocks preserve DB IDs;
- new blocks use local: client identities.
Only one Homework block is actively editing at a time.
Done exits editing only.
It does not imply persistence.
Homework block management
Supported blocks have:
- Edit
- Duplicate
- Move Up
- Move Down
- Delete
- drag handle
Unknown block types remain safe/non-editable.
Reorder
Uses dnd-kit.
Supports:
- pointer
- touch
- keyboard.
Reorder:
- updates staged order;
- normalizes contiguous positions;
- preserves identity/content;
- marks Homework dirty;
- makes no immediate DB write.
Move Up/Move Down reuse the same underlying reorder logic.
Duplicate
Duplicate:
- inserts immediately after source;
- copies content;
- gets new local: ID;
- clears persisted snapshot/logical identity;
- becomes a new logical block when persisted;
- opens the duplicate for editing.
Do not reuse the original logical identity.
Delete
Destructive delete uses exact uppercase:
DELETE
Delete:
- updates staged state only;
- makes no immediate DB write;
- is persisted only through Session-level save/publish.
Discard restores persisted deleted blocks.
Historical immutable Homework versions must never be deleted by ordinary editing.
Unified Session + Homework persistence
Pass 2C-A implemented one atomic Session-level save/publish operation.
Migration:
supabase/migrations/20260924230000_session_homework_authoring_persistence.sql
DEV verifier:
features/homework/homework-builder-persistence-dev-verification.sql
The coordinator reuses existing Session and Homework lifecycle functions rather than replacing their rules.
Atomicity
When both Session and Homework participate in the same action:
- both commit;
- or both roll back.
Do not perform two independent client calls that can partially save the authoring document.
Save Changes rules
Homework only dirty
- Save Homework.
- Do not unnecessarily rewrite Session Material.
Session only dirty
- Save Session.
- Do not rewrite Homework.
Both dirty
- Persist both atomically.
Draft Session + Homework
Save:
- keeps Session Draft;
- keeps Homework editable Draft;
- persists block content/order;
- replaces local: IDs with persisted server identities.
Publish Session:
- may be clicked directly without prior Save;
- persists staged Session and Homework changes atomically;
- publishes Session;
- publishes authored Homework if present/valid.
Homework is optional
A Session can publish with no Homework.
Opening Homework and creating an empty root/Draft must not force creation of an empty published Homework version.
Rules:
- zero Homework blocks → Session may publish;
- authored but invalid block → validation error.
Published Session / unassigned Homework
A published Homework version that has never been assigned may remain editable in place according to Foundation rules.
Do not create unnecessary new versions.
Published Session / assigned Homework
Once assigned, published Homework is immutable.
Editing must:
- create or reuse a pending Draft;
- never mutate assigned history;
- reuse the same pending Draft on subsequent saves.
Session remains visibly Published.
Publish Changes
When a Published Session has a persisted pending Homework Draft:
Publish Changes
is available.
It publishes the pending Draft as the next immutable Homework version.
Existing assignments:
- remain on previous versions.
New assignments:
- use latest published version.
Publish Changes is an action, not another lifecycle badge.
Save adapter bug that was fixed
A browser 500 was caused by extracting:
supabase.rpc
and calling it unbound.
This lost the Supabase receiver and threw:
Cannot read properties of undefined (reading 'rest')
Resolution:
- bind supabase.rpc to the Supabase client in the narrow save adapter.
Do not reintroduce unbound Supabase instance method calls.
Session Material: Pages + Resources
This is the newest authoring model.
Pages
Session Material rich_text is now labeled:
Page
in Session Material UI.
Storage remains:
rich_text
No DB migration was made for terminology.
Pages represent core curriculum reading/teaching content.
Each Page:
- Title
- full Rich Text body
- stable identity
- reorderable among Pages.
Add Page
Top-level Session Material actions now display:
Session Material                  Preview   + Add Page
Add Page directly creates a staged rich_text block and opens the shared Rich Text authoring component.
No chooser is necessary because Page maps to one block type.
Resources
Resources are supplemental Session content.
Current Resource type:
Video / Link
Storage remains:
video_link
UI:
Resources                         + Add Resource
Add Resource uses the existing ShadCN Sheet.
Currently only Video / Link is active.
Future possibilities such as:
- PDF
- worksheets
- downloads
- attachments
are deferred.
Grouping rules
Existing Session data may be interleaved in storage:
rich_text
video_link
rich_text
video_link
UI groups them:
- Pages
- Resources
without automatically mutating staged data or marking the Session dirty.
Relative Page order is preserved.
Relative Resource order is preserved.
Pages reorder within Pages.
Resources reorder within Resources.
Do not drag Pages into Resources or vice versa.
Preview architecture
Completed milestone: Session + Homework Preview. It is merged to local `main` and available on the manually pushed `feature/homework-preview` remote branch.
Preview uses current staged state, including unsaved changes.
No save is required before previewing.
Preview performs no DB writes.
Unified Preview
One Session-level `Preview` action appears beside the Session title. Its initial tab follows the active workspace.
Opening while Session Material is active defaults to:
Session Material
Opening while Homework is active defaults to:
Homework
Preview contains tabs:
Session Material | Homework
Switching preview tabs:
- does not persist;
- does not dirty;
- does not change builder workspace;
- does not discard.
Session Material Preview
Pages display one at a time.
Concept:
Session Material Preview

Page 1 of 3

Communication and Expectations

[full rich-text page content]

Previous Page                Next Page
Rules:
- full read-only rich-text rendering;
- participant-style presentation;
- no builder controls;
- Previous disabled on first Page;
- Next disabled on last Page;
- navigation is local Preview state only;
- Page selection follows stable Page keys.
Resources display separately from Pages.
Current first-pass behavior places Resources in their own section within Session Material Preview.
This placement should be reviewed visually before deciding whether Resources eventually belong:
- below every Page;
- below the final Page;
- or in a dedicated Resources sub-area.
No decision beyond the current separate section has been finalized.
Latest Preview/editor refinement:
- Page title and read-only Rich Text body use the same horizontal content inset.
- The shared RichTextEditor has a bounded internal vertical scroll viewport; the toolbar remains outside that viewport.
- Desktop content max height is 28rem; narrow-screen content max height is 45vh.
- Session Material Page, Homework Rich Text, and Homework Long Answer use the same shared editor behavior.
- No Preview state, persistence, lifecycle, schema, or content contract changed for this refinement.
Latest Video / Link Preview refinement:
- The shared participant-facing VideoLinkPreview displays its title, description, and Open Link action without showing the raw URL as visible body text.
- Open Link continues to use the staged/persisted URL as its href with the existing new-tab target, rel value, and accessible label.
- The URL remains in staged and persisted block data and in the authoring form; validation and persistence inputs are unchanged.
- Session Material Resources and Homework use this same shared presentation.
Final browser/manual review approval (user-reported September 28, 2026):
- Session-level Preview behavior looks correct.
- Session Material Preview title/body alignment looks correct.
- Bounded RichTextEditor scrolling looks correct, with the toolbar visible while the content scrolls.
- Video / Link Preview shows Title, Description, and Open Link without a redundant visible raw URL.
- Session Material Resources Preview and Homework Video / Link Preview are approved.
- This records the user's completed review and approval; it is not a claim of independent agent browser testing.
Homework Preview
Homework Preview currently supports:
- Rich Text
- Video / Link
- Long Answer
- staged order
- unsaved changes
- empty state
- incomplete safety state
- unknown-block safety state.
Homework Preview should remain as currently designed unless visual review identifies a problem.
Rich Text Preview
Preview uses full read-only rich-text rendering rather than the builder’s collapsed two-line summary.
It should preserve:
- headings
- paragraphs
- bold
- bullet lists
- numbered lists
- links
- authored new-tab behavior.
Video / Link Preview
Displays:
- Title
- Description
- Open Link action.
Does not display the raw URL as participant-facing text; the URL remains in underlying content data and powers Open Link.
Do not add arbitrary iframe/media embedding yet.
Long Answer Preview
Displays:
- full authored prompt;
- participant-style sample response area.
The response area is non-submittable and performs no persistence.
No participant response rows are created.
Collapsed builder summaries
Session Material and Homework share a Rich Text read-summary responsibility.
Collapsed cards show:
- explicit title, or first meaningful heading when no title;
- approximately two-line body preview;
- ellipsis;
- View more / Show less only when needed.
Expand/collapse is presentation state only and must not affect dirty state.
Do not duplicate identical title/heading text.
Section header consistency
Session Material currently:
Session Material                  Preview   + Add Page
Build and organize the material participants will use.
Pages:
Pages
Create and organize the reading material for this Session.
Resources:
Resources                         + Add Resource
Add supporting videos, links, and other resources for this Session.
Homework:
Homework                          Preview   + Add Content
Build the homework participants will complete for this Session.
Use the shared authoring header/action layout so these stay visually aligned.
4. Current Status & Exact Next Steps
Git state
Completed Homework Builder milestone
Merged feature commit:
f248c4233da41fcec5767e0d476a3cd21ba0b7e4
feat: complete homework builder authoring
Merged to main with:
81e177780c9adb35a0f523e84a9b62e5ed7273d4
merge: complete homework builder authoring
Remote:
git@github.com:resonatemovement/marriage_ministry.git
Old branch:
feature/homework-builder-ui
was deleted locally and remotely after merge.
Completed Preview milestone
Feature commit:
64dec0314e78988f420ca957eb2bac064fb83a9d
feat: complete session and homework preview
User-authored feature-branch state commit:
cd55a11887b34c37363e01c83c3d93a3f8041b30
docs: record preview closeout status
Local merge commit on `main`:
a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2
merge: complete session and homework preview
The feature commit and follow-up docs commit were manually pushed by the user. Current local tracking refs show `main` and `origin/main` at the Preview merge; the remote-tracking Preview branch is absent. No network fetch, push, or remote deletion was performed during the Resource Library foundation task.
The local `feature/homework-preview` branch was deleted after verifying its commits are reachable from `main`.
Current branch
main
Resource Library foundation commit `863e526` (`feat: add resource library foundation`) and completion commit `cbb562d` (`feat: complete resource library`) are integrated through no-squash merge commit `eb6cdd5` (`merge: complete resource library`). The feature ref was pushed to `origin` before merging. No deployment occurred.
Preview work included in the milestone merge
Major Preview work includes:
- Homework Preview Pass 1
- unified Session Material/Homework Preview
- Session Material | Homework Preview tabs
- full Rich Text read-only rendering
- Long Answer sample response presentation
- Video / Link Preview
- staged-state Preview
- empty/incomplete/unknown states
- Session Material Pages model
- Session Material Resources model
- Add Page
- Add Resource
- Page-by-page Session Material Preview
- Page navigation
- Resource Preview
- one Session-level Preview action beside the Session title;
- initial Preview tab selected from the active builder workspace;
- Session Material header action alignment: Add Page is in the Session Material header; Preview remains beside the Session title.
Known relevant files added/changed include:
features/homework/homework-preview.tsx
features/homework/homework-preview.test.ts
features/session-builder/session-preview.tsx
features/session-builder/session-preview-context.tsx
features/session-builder/session-preview.test.ts
features/session-builder/session-material-editor.tsx
features/session-builder/session-editor.tsx
features/session-builder/session-editor-presentation.test.ts
plus shared Rich Text renderer/test changes and existing Preview integration files.
The Preview milestone audit found only Preview implementation/tests and approved AGENTS.md/PROJECT_STATE.md workflow documentation. No unrelated files, temporary files, debug code, secrets, migrations, generated types, or DB/security changes were included.
Most recent focused validation before the full milestone gate:
- Node v24.21.0
- 21 focused tests passed across 5 files: Session Preview, RichTextEditor, Homework Preview, Session editor presentation, and Homework builder presentation.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- The RichTextEditor layout test checks toolbar placement outside its responsive bounded scroll viewport.
Earlier focused Preview validations (28 tests across 6 files and 10 tests across 2 files) are historical and are superseded by the latest focused validation above.
Final Preview milestone regression gate completed September 28, 2026 on the code after the Video / Link cleanup:
- Node v24.21.0.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` passed: 358 tests across 68 test files.
- `npm run build` passed using Next.js 16.3.1 with webpack.
- `git diff --check` passed as the final gate command.
- `npm run verify:supabase` was not run, per task scope; Preview made no DB changes.
- No regression fixes were needed during the gate.
Browser/manual Preview review is reported complete and approved by the user, including Session-level Preview behavior, Page title/body alignment, bounded editor scrolling with a visible toolbar, and Video / Link presentation in both Session Material Resources and Homework. The agent records the user's approval and does not claim independent browser execution.
Preview's final code is locally merged. The user's browser/manual review was completed and approved as described in the preceding section.
Focused validation for the Video / Link refinement before the final gate:
- Node v24.21.0; 7 tests passed across 2 files.
- `npm run typecheck`, `npm run lint`, and `git diff --check` passed.
Browser/manual review status (user-reported complete and approved):
- Session-level Preview behavior, Session Material Page title/body alignment, and Page-by-Page Preview were reviewed and approved.
- RichTextEditor bounded internal scrolling and persistent toolbar visibility were reviewed and approved.
- Shared Video / Link Preview was reviewed and approved in Session Material Resources and Homework; no redundant raw URL is shown.
- The user reports the overall Preview behavior and responsive presentation look correct. The agent did not independently perform the browser review.
The Resource Library standalone UI became the next milestone after Preview closeout; its implementation and current follow-up are recorded below.
Preview milestone closeout (completed locally)
Final regression and diff checks passed; browser/manual review was user-approved.
Preview and its follow-up state commit are on the remote Preview feature branch.
Preview is merged to `main`; local `origin/main` now matches merge commit `a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2`. The local Preview branch was deleted after confirming reachability; its remote-tracking ref is now absent. These tracking observations do not claim a new fetch or agent push/deletion.
No deployment occurred; PROD remains untouched.
Completed prior milestone: Resource Library foundation and standalone UI are implemented, regression-validated, browser-approved, and merged into `main`.
The Resource Library foundation is committed as `863e526`; completion is `cbb562d`, merged by `eb6cdd5`. No deployment occurred; PROD remains untouched.
The Session Material integration discussed after this standalone closeout is now in progress on `feature/session-resource-library`; its current status is recorded below.
Product direction:
- Standalone application-level Resource Library, conceptually analogous to a WordPress Media Library.
- Not owned by Session Material. Uploaded Resources may later be referenced from Session Material and other application features.
- Consumers reference stable Resource identity; do not duplicate files or use raw Storage URLs as identity.
- Top-level feature available to Super Admin, Admin, and Author.
V1 permissions:
- Super Admin/Admin: upload, browse, edit metadata, replace files, archive, and permanently delete eligible unused Resources.
- Author: upload, browse active resources, select in consumers, edit metadata and replace only Resources originally created by that Author. The applied integration migration adds a narrow read exception for archived Resources already linked in Session Material; archived Resources remain unavailable for new selection.
- Archive, restore, and permanent-delete authority remains Super Admin/Admin. Admin replacement never transfers original ownership. Active workspace grants no permission.
File categories:
- Images, PDFs, document files including Word documents, audio, and video. The standalone UI uses generic category-aware file representations and native audio/video controls; no elaborate file-specific renderer is included.
Architecture direction:
- Binaries live in Supabase Storage. Metadata, stable identity, permissions, version relationships, and usage references live in Postgres.
- `resource_id` is stable Resource identity. A consumer must not treat a raw Storage URL/path as identity.
- External Video / Link remains distinct from uploaded managed Resources.
Implemented DB/domain model:
- `resources`: stable UUID, title, optional description, DB-enforced image/document/audio/video category, original created_by, updated_by, timestamps, archived_at/by, current_version_id, persistent last_version_number.
- `resource_versions`: immutable UUID, resource_id (RESTRICT FK), unique monotonic per-resource version_number, unique storage_path, original_filename, MIME, size_bytes, uploaded_by, created_at.
- Composite current FK `(resources.id, current_version_id)` -> `(resource_versions.resource_id, id)` prevents cross-resource pointers. Resource row locking serializes finalization; monotonic counter survives pruning. Version UPDATE is rejected by a trigger; authenticated direct table writes are not granted.
- `resource_uploads`: pending reserved Resource/Version IDs and intended metadata, uploader, created_at/3-hour expiry, exact destination; no upload/auth tokens stored. Initial resource shells are invisible through RLS until finalized.
- `resource_storage_cleanup`: transactional deletion outbox, path/resource ID, not_before, timestamps, attempts, last_error. No speculative polymorphic usage table or production consumers.
Storage and validation:
- Private `resource-library` bucket, overall 262144000 bytes (250 MiB), accepted MIME allowlist. Object path `{resource_id}/{version_id}/{sanitized-original-filename}` is metadata, never identity/public canonical URL.
- Central application/server `features/resource-library/policy.ts`: image 15 MiB, document 25 MiB, audio 75 MiB, video 250 MiB (approved MB values use binary bytes, consistent with existing buckets). The DB has one defense-in-depth validation snapshot with a focused alignment test, not limits scattered across RPCs.
- MIME contract: image/jpeg, image/png, image/webp, image/avif; application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document; audio/mpeg, audio/mp4, audio/aac, audio/wav, audio/x-wav, audio/x-m4a; video/mp4, video/webm. Word is document. Filename extension alone never authorizes upload. Preserve original image binaries; no conversion or thumbnails.
- Server-only prepare validates active authenticated role, ownership, category, MIME, size, and exact intent; authenticated hardened RPC independently validates permissions/file contract. Only then does server-only service Storage issue an exact-path non-upsert signed upload token. No authenticated Storage INSERT/UPDATE/DELETE policies, and no Next/Vercel binary proxy.
- Finalize checks Storage object existence and actual upload metadata MIME/size, transactionally inserts history and advances current. RLS restricts metadata/private-file reads; view/download uses authenticated-client 5-minute signed URLs. Bearer access already issued expires naturally rather than instantly revoking on archive.
- Reuse: existing AppRole and admin-role predicate (now exported without behavioral change), getAuthenticatedIdentity, createServerSupabaseClient, Supabase env/service-client conventions, private.current_user_has_role, private.set_updated_at, public.audit_events. Resource-specific validation/versioning is new because profile-photo overwrite/onboarding and Session/Homework lifecycles have different responsibilities.
- `server.ts` provides prepare/finalize/cancel, browse/detail, metadata edit, signed view/download, archive/restore, uppercase DELETE eligible permanent delete, and explicit admin cleanup retry. Authenticated metadata-only Server Actions wrap these server-only operations; binaries transfer directly from the browser to private Supabase Storage.
Replacement/versioning:
- Replace File is a first-class operation that preserves `resource_id`, creates a new file version, and keeps current metadata and relationships attached to the Resource. Metadata edits are independent of binary replacement.
- Normal/current use may resolve to the latest active version. Future immutable/historical assignments may pin a specific version; replacement must not alter a pinned historical version.
- Always retain the current version and up to 3 previous versions. Protect versions referenced by historical/immutable records, even when older than the standard retention window.
- Successful replacement finalizes a NEW immutable version under the SAME Resource ID before pruning. Failure before finalization preserves the previous current version. Finalize retries are idempotent and never rewind current; future Restore Previous Version must create another new version.
- Older unreferenced versions beyond the window are pruned transactionally into the cleanup outbox. The server removes only committed queued Storage paths, then acknowledges them. Failure leaves a retryable row/error and returns explicit maintenance errors without breaking current or claiming replacement failure.
- Keep retention count in one centralized/configurable server-side policy value, not scattered magic numbers.
- There are no production pinned consumers. BEFORE the first version-pinning consumer, add its explicit RESTRICT FKs and extend pruning/reference checks and tests. The current prune RPC already skips FK-protected candidates as the final safety net; the rollback-only verifier tests that with a temporary consumer table which does not persist.
- Cancel/finalize lock in the same order; cancellation never queues a committed finalized version after an ambiguous network response. Abandoned initial shells/expired intents can be cleaned by admin retry. Cancellation removal waits beyond token expiry (3-hour reservation; signing permitted only in the first minute; standard signed tokens last 2 hours).
- No scheduler added. Admin `retryResourceCleanup` expires intents/drains eligible queue in bounded batches; scheduled maintenance is deferred. Resumable/TUS introduction must revisit orphan timing (TUS URLs may live 24 hours).
Deletion:
- Never hard-delete a referenced Resource; archive it and keep historical references resolvable.
- Admin/Super Admin archive/restore preserves Resource/history/binaries. Eligible unused permanent delete is implemented server-side and requires exact uppercase `DELETE`; confirmation UI is deferred.
- Enforce referential safety in server/database logic, not only in UI.
- DB deletion and outbox insertion are atomic. Future restrictive Resource/Version consumer FK rejection rolls back both; Storage is never touched on rejected DB deletion. No historical application records cascade away.
At this standalone milestone, Session Material integration was deferred until user review. That review is complete, and the separately approved integration is now in progress below; no standalone Resource Library consumer was added during the original milestone.
Migrations and generated types:
- Created/applied through Marriage Ministry DEV MCP only: `supabase/migrations/20260929152032_resource_library_schema.sql` and `20260929152039_resource_library_operations.sql`. Local timestamps match MCP-recorded DEV migration versions; both applied successfully to lctkqjjkhpyootwvttvj. Bucket verified private with approved overall limit/MIMEs.
- `types/database.generated.ts` regenerated from DEV via MCP, never hand-edited. The sole nullable UUID RPC argument accommodation is localized in the server reserve adapter because the generator represents SQL nullable arguments as non-null strings; no `any` workaround.
Foundation validation performed September 29, 2026:
- Node v24.21.0; initial focused gate passed 63 tests across 4 files: policy (27), upload orchestration (10), server data access (14), existing counseling role/domain regressions (12).
- Initial `npm run typecheck`, `npm run lint`, and `git diff --check` passed.
- Initial rollback-only DEV SQL verifier passed: Admin/Super Admin and own-Author management, other-Author/unauthorized denial, raw table/Storage write protection, hidden pending creation, Version 1/current, replacement/ownership/version numbering, failed object validation preserving current, immutable UPDATE, duplicate numbering, category/size enforcement, cross-resource FK, current+3 retention, temporary pinned-FK protection, archive/restore, delete rejection/outbox, abandoned-intent expiry. Synthetic Storage metadata only; no actual binary transfer.
- Post-verifier read checks confirmed zero Resource/Version/intent/outbox rows, zero synthetic profiles/Storage objects, and no temporary verifier consumer table. No persisted synthetic fixtures.
- Established `npm run verify:supabase` passed HTTP 200 after a network-sandbox failure and approved outside-sandbox retry. No secrets printed.
- Browser/manual upload verification is not performed: there is no Library UI. Project-wide Storage limit is not verified or changed and could cap the bucket's 75/250 MiB allowances; verify it before large-file UI tests. MIME checks validate upload metadata, not file-signature/virus scanning. Real direct browser uploads and resumable transport remain unverified/deferred.
- Resource implementation/details and future safety constraints documented in `features/resource-library/README.md`. No Session Material, Homework, Video/Link, or Preview changes/integration; no PROD access/mutations, deploy, commit, push, merge, or branch deletion.
- Completion speech attempted with `say "Resonate Resource Library foundation is ready for review"`; the command returned 0 but emitted `sandbox_extension_issue_file failed for /usr/bin: 1 (Operation not permitted)`. Audible delivery is unconfirmed due to the sandbox error.

Resource Library foundation final validation and closeout (September 29, 2026, Node v24.21.0):
- `npm run typecheck` passed; `npm run lint` passed.
- `npm test` passed: 409 tests across 71 files (includes the 63 focused foundation/domain tests).
- `npm run build` passed using Next.js 16.3.1 with webpack.
- `git diff --check` passed before this closeout state update; rerun after editing this file.
- `npm run verify:supabase` passed HTTP 200 after network approval.
- Marriage Ministry DEV MCP access was restored. The existing rollback-only `features/resource-library/resource-library-dev-verification.sql` was rerun successfully against Marriage Ministry DEV project `lctkqjjkhpyootwvttvj` and returned `PASS`; its transaction rolled back.
- Post-run confirmation: no synthetic Resource fixtures, Resource Version fixtures, upload-reservation fixtures, or cleanup/outbox verifier fixtures remain. No legitimate DEV data was deleted.
- Full diff/file audit found only the approved Resource Library foundation (code/policy/tests/docs/migrations), the generated database types, the reused admin-role helper export, and this project-state update. No UI, temporary files, debug logs, secrets/tokens, unrelated product behavior, unexpected PROD configuration, or stale generated-type edits. MCP-generated `types/database.generated.ts` matches generator output; the nullable RPC-argument accommodation remains localized.
- The foundation was committed as `863e526` (`feat: add resource library foundation`). It was not pushed, merged, or deployed.
- At foundation closeout, browser/manual upload verification was not performed because the Library UI did not yet exist. Project-wide Storage limit was not verified or changed and could cap the bucket's 75/250 MiB allowances; MIME checks validate upload metadata, not file-signature/virus scanning. Real direct browser uploads and resumable transport were unverified at that milestone.
- Resource implementation/details and future safety constraints documented in `features/resource-library/README.md`. No Session Material, Homework, Video/Link, or Preview changes/integration; no PROD access/mutations, deploy, commit, push, merge, or branch deletion.
- Completion speech attempted with `say "Resonate Resource Library foundation is ready for review"`; the command returned 0 but emitted `sandbox_extension_issue_file failed for /usr/bin: 1 (Operation not permitted)`. Audible delivery is unconfirmed due to the sandbox error.
Resource Library standalone UI implementation (September 29, 2026; Node v24.21.0):
- Added top-level navigation after Session Builder for Admin/Super Admin and Author workspaces, plus `/resource-library` route authorization through the shared role guard. Campus Lead, Coach, Counselor, Couple, and other unauthorized roles do not receive the navigation or route access.
- Implemented the Resonate grid-first page with active-by-default browsing, Admin/Super Admin Archived view, All/Images/Documents/Audio/Video filters, and local case-insensitive search across loaded titles, descriptions, and current filenames. The existing browse operation returns a deterministic first 50 and reports the total; UI pagination was not introduced.
- Added first-use, search-empty, category-empty, and archived-empty states. Upload controls are available to all authorized page roles.
- Added an accessible responsive Upload Resource Sheet and shared replacement flow. Category derives from centralized MIME policy; MIME/size/title validation runs before reservation. The browser uses the existing signed reservation and uploads directly to Supabase Storage, then calls the existing finalization operation. Upload stages are reported as Preparing, Uploading, and Finalizing; the SDK exposes no reliable byte progress, so no percentage is shown. Failures remain visible and failed Storage transfers request safe reservation cancellation.
- Added Resource detail Sheet with short-lived RLS-authorized signed image/audio/video previews, document representation, Open and Download links, uploader/date/file metadata, metadata editing, Replace File, Admin archive/restore, and Admin permanent deletion using the existing shared exact-uppercase `DELETE` predicate. Resource paths, tokens, internal UUIDs, and signed URLs are not displayed or persisted in Resource data.
- Author controls derive from the existing ownership/archive policy; Authors can manage only their own active Resources and do not see archive/restore/delete controls. Server actions delegate mutations to existing server/RPC authorization; UI visibility is not the security boundary.
- Reuse: existing `requireOneOfRoles`, authoring workspace resolution, shared navigation/Shell, ShadCN Sheet/AlertDialog and focus helper, `Card`, Sonner, centralized Resource policy/upload orchestration, authenticated Supabase client, RLS signed-read operations, and shared `isDeleteConfirmation`. There was no generic reusable destructive-confirmation dialog; the existing accessible AlertDialog primitives and shared predicate are used.
- Focused validation under Node v24.21.0: 64 tests passed across 7 files (Resource access, policy, presentation, upload orchestration/client upload, existing Resource server operations, and navigation). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. The full suite/build were not run as instructed.
- The user reports browser review complete and approved: navigation, grid/search/filter, upload (including multi-role Super Admin + Coach authorization), one-click Open and Download, concise Uploading... label with separate detailed phase text, Edit Details, Replace File, Archive, Restore, and permanent Delete. The user accepted Safari's native per-site download permission prompt as expected browser behavior.
- The user reports current Marriage Ministry DEV Supabase Storage global upload cap is 50 MB. Files larger than that cannot be manually validated on the current plan. Preserve intended app limits (Images 15 MiB, Documents 25 MiB, Audio 75 MiB, Video 250 MiB); do not lower product limits for this temporary cap. Future Pro plan should permit practical larger audio/video validation.
- No schema, RLS, RPC, migration, generated-type, Session Material, Homework, Session Preview, or Homework Preview changes were made. PROD was untouched. No commit, push, merge, or deploy was performed for the UI milestone.

Targeted shared auth identity correction (September 29, 2026; Node v24.21.0):
- Marriage Ministry DEV read-only verification established John Walker as active with persisted `super_admin` and `coach` roles. The selected Admin or Coach workspace is UX state and does not grant or reduce Resource Library permissions. The initial browser upload attempt returned `Not authorized` before Storage transfer; after the shared identity correction, the user reports the multi-role upload succeeds.
- Extended the existing `AuthenticatedIdentity` with the authenticated user/profile `id` from its already verified claims subject. The shared identity loader still returns all recognized persisted roles, including both roles on a multi-role account, and still gives legitimately role-less or inactive profiles no active permissions.
- Actual getClaims, profile, and profile_roles failures now produce controlled, non-sensitive errors rather than `null`, a fallback identity, or an active identity with an empty role list. A genuinely absent subject remains unauthenticated; a genuinely missing profile and an inactive/deactivated profile retain their prior no-permission behavior.
- Resource Library `context()` now builds its actor from one identity's `id` and complete `roles` array, without a second claims lookup. Resource detail management visibility uses the same identity ID. Resource role checks, Author ownership, and independent database `auth.uid()`/RPC/RLS authorization are unchanged; workspace selection is not used for upload authorization.
- Focused Node v24.21.0 tests passed: 42 tests across 4 files (`lib/auth/session.test.ts`, Resource server, upload orchestration, and client upload). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Full suite/build were not run.
- The user reports the Super Admin + Coach multi-role upload succeeds in browser review. Authorization retains every persisted role, independent of workspace selection; this corrected the previously reported rejection. No schema, RLS, RPC, migration, generated-type, application data, or PROD changes were made for this correction.
- Resource Library now uses one canonical authenticated identity for actor ID and all roles. Actual authentication, profile, and role query failures surface controlled errors rather than silently degrading to a generic authorization denial; independent RPC/RLS authorization remains intact.

Resource Library upload button loading-label consistency (September 29, 2026; Node v24.21.0):
- The upload submit button retains its normal “Upload Resource” label and now shows “Uploading...” for preparing, direct Storage upload, and finalizing phases. It remains disabled while busy; the existing separate status line retains the detailed phase message. No spinner, upload state-machine, duplicate-submit, or Cancel/close behavior changed. Replacement's idle label remains “Replace file.”
- Focused structural coverage was added for normal/loading labels, all active phase details, busy disabling, and separation of detail text from button text. Validation results are recorded below only for commands actually run for this task.
- Browser/manual review is reported complete and approved by the user. The upload label is “Upload Resource” at rest and “Uploading...” while any stage is active; phase-specific status text stays separate.

Resource Library one-click secure download (September 29, 2026; Node v24.21.0):
- Replaced the two-step signed-link UI with a same-origin Resource download Route Handler. The existing `signedResourceAccess` path still authenticates the user, applies the established Resource browse authorization, and resolves the RLS-readable current version; Storage creates a five-minute signed attachment URL using the sanitized original filename. The route redirects the browser to Storage, so large file bytes are not proxied through Next.js.
- The detail action now navigates on the initial click, disables itself while navigation is pending, and uses “Download” / “Downloading...”. The intermediate “Download file” link and its signed-URL client state/action were removed. Preparation failures redirect back to the Library and display a concise toast; Open continues using its existing signed preview URL independently. Safari may still show its native per-site download permission prompt.
- Focused validation under Node v24.21.0: 23 tests passed across 4 files (download route, detail download UI, server authorization/signed-access, and Resource presentation). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Full suite/build and DB verifier were not run.
- User-reported browser review is complete and approved, including the one-click download and accepted Safari prompt. No commit, push, merge, or deploy. Current branch is `feature/resource-library`; Resource Library UI/auth/download changes remain uncommitted.

Resource Library standalone UI final regression gate and closeout review (September 29, 2026; Node v24.21.0):
- Browser review is reported complete and approved by the user: navigation, grid/search/filter, upload with the Super Admin + Coach account, Upload Resource → Uploading... with separate stage details, Open, one-click Download without an intermediate link, Edit Details, Replace File, Archive, Restore, and exact-confirmed permanent Delete. Safari's native per-site permission prompt was accepted; the application does not suppress it.
- The current DEV Supabase global Storage limit is 50 MB. Uploads above 50 MB cannot be manually validated on this plan. Product limits remain Images 15 MiB, Documents 25 MiB, Audio 75 MiB, Video 250 MiB; do not reduce them. Defer practical larger audio/video validation until a future Pro plan.
- Node v24.21.0 regression gate: `npm run typecheck` passed; `npm run lint` passed; `npm test` passed with 443 tests across 79 files; `npm run build` passed; `git diff --check` passed.
- `npm run verify:supabase` passed (Auth settings HTTP 200) against configured DEV ref `lctkqjjkhpyootwvttvj` after the initial sandbox-blocked network attempt was retried with approval. No other Supabase project was accessed.
- The existing rollback-only `features/resource-library/resource-library-dev-verification.sql` ran once through the Marriage Ministry DEV MCP (`lctkqjjkhpyootwvttvj`) and returned `PASS`; its final `ROLLBACK` executed. Therefore all synthetic auth/profile, Resource, Version, reservation, Storage metadata, outbox, audit, and temporary FK fixtures were rolled back/removed. No legitimate DEV data was deleted.
- Full branch/worktree audit found only the approved Resource Library foundation (including its two DEV-applied migrations and regenerated Resource database types), standalone UI, shared auth identity correction, upload-label and download refinements, their tests/docs, PROJECT_STATE updates, and the shared authoring workspace helper extraction with unchanged Session Builder behavior. The generated Homework authoring RPC type corresponds to its existing Homework migration; no Homework, Session Material, or Preview implementation/integration edits, temporary files, debug logs, secrets, or unapproved migrations were found. `features/session-builder/access.ts` only exports the existing workspace resolver for reuse.
- Knip reported pre-existing repository findings in unrelated files: one unused script, three unlisted dependencies, fourteen unused exports, and ten unused exported types; it reported no unused Resource Library files/exports. No unrelated baseline finding was changed in this closeout.
- No source/schema/RLS/RPC/migration/generated-type changes were made during final validation. No regression fix was needed. Current branch at validation was `feature/resource-library`; approved UI/auth/download changes were pending the explicitly authorized Git closeout. PROD was untouched.
- The next approved milestone is Session Material Resource Library integration, now in progress; see the current status below.

Deferred Resource Library validation and design:
- Current DEV's 50 MB global Storage cap (user-reported) prevents manual validation of uploads larger than 50 MB; intended product category limits remain 15/25/75/250 MiB. Revisit practical large audio/video validation on a future Pro plan. Consider resumable uploads only if later needed.
- Additional Resource consumers beyond Session Material remain deferred. Future assigned/pinned consumers need explicit `resource_version_id` FK/reference protection and extended pruning tests before version pinning is enabled.
- Before adding future pinned or historical consumers, add explicit restrictive foreign keys/reference protection and extend pruning/reference tests.

Session Material → Resource Library integration (September 30–October 1, 2026; complete):
- Feature commit `4596f82` (`feat: complete session resource library integration`) was pushed to `origin/feature/session-resource-library`, then merged into `main` without squash as merge commit `db0405f` (`merge: complete session resource library`) and pushed to `origin/main`. The feature branch was deleted locally and from origin, then remote-tracking references were pruned. No deployment or PROD access occurred.
- The authoring UI now offers dedicated Image, Document, Audio, Video, and existing Video / Link choices under one Resources list. The first four use one staged `library_resource` block model with `resource_id` and fixed `resource_category`; Video / Link remains the existing external URL block. The type-filtered picker reuses Resource Library browse authorization and metadata search, shows active Resources only, and makes no immediate DB write. Replace Selection stays in the same category; Remove from Session removes only the reference; duplicate creates a new Session block identity with the same Resource ID. All Resource types share staged ordering, whole-Session Save/Publish, Discard, and dirty/navigation protection.
- Local Preview renders Image, Document, Audio, and uploaded Video distinctly, using authorized short-lived signed private access and same-origin Open/Download redirects; external Video / Link retains its existing presentation. No binary proxy or signed URL is persisted. Canonical Resource title/description/current version are resolved on Session load; no Session captions or version pins are stored. Archive keeps existing links visible and usable; picker excludes archived Resources. User browser review approved all listed integration behavior, including the Video / Link external-link icon.
- DEV MCP authentication was restored and the project URL confirmed as `https://lctkqjjkhpyootwvttvj.supabase.co`. Only the contents of local migration `20260930120000_session_resource_library_integration.sql` were applied to DEV through the MCP; the server recorded version `20260930194424_session_resource_library_integration`. It adds the real `resource_id` FK with ON DELETE RESTRICT, category/content checks, a trigger and transactional save-RPC validation, and a narrow Author read policy for archived Resources already linked from Session Material. The Resource delete RPC's restrictive FK failure is DEV-verified. At this authoring milestone no Couple assignment/pinning integration existed; Phase 1 lifecycle later pinned `resource_version_id` in case-session snapshots with restrictive FK protection, and the Couple Session View now reads/signs those exact pinned versions.
- `types/database.generated.ts` was regenerated from the DEV MCP output, not hand-edited, and matches that output exactly. Its diff adds only `resource_id` and `resource_category` to Session Material block row/insert/update types and the Resource FK relationship. The rollback-only verifier `features/session-builder/session-resource-library-dev-verification.sql` passed after fixing an ambiguous local variable and removing an authenticated-role read of the restricted Storage cleanup table. It covered four Resource categories, persisted IDs, category mismatch rejection, protected deletion, archived reference resolution, rejection of new archived selection, mixed ordering with Video / Link, duplicate block identity, and reference-only removal. Its transaction ended with `ROLLBACK`; a follow-up DEV query found zero matching synthetic users, Resources, and Sessions.
- Node v24.21.0 validation after the DEV migration: 39 focused tests across 7 Session Builder files passed; `npm run typecheck`, `npm run lint`, and `git diff --check` passed. `npm run verify:supabase` passed via read-only Auth settings HTTP 200 for DEV project `lctkqjjkhpyootwvttvj` after an approved outside-sandbox retry. No full suite, production build, or browser review was run. No other Supabase project was accessed; PROD was untouched.
- Session Resource authoring UX refinement: selecting Image, Document, Audio, or Video in Add Resource appends an incomplete local `library_resource` block and opens its editor without opening the picker. The block's type-specific Choose action opens one large responsive Radix Dialog modal; active matches display immediately and search only filters them. Type-specific modal headings, descriptions, and search placeholders identify Image, Document, Audio, or Video. Image results use the shared Resource Library thumbnail and signed preview mechanism in a responsive grid; other categories use browseable cards with shared file-type icons and size formatting. The browse area scrolls independently within the modal. Empty categories and empty searches have distinct type-specific messages. Selecting a Resource fills the same staged block, closes the modal, and leaves editing active. Replace Selection opens the same modal with same-category active-only filtering. Done editing stays disabled until a matching active Resource is selected; existing Save/Publish validation remains strict. Escape, close button, focus handling, accessible title/description, and keyboard-selectable cards use Radix Dialog behavior and semantic controls.
- Cancel is shown only while a newly created Resource or Video / Link block remains in its initial edit state. It removes that local block and discards its staged fields or Resource reference. The existing staged Session/baseline comparison restores clean state when the block was the only change and preserves other dirty changes. Persisted blocks retain their existing edit/remove behavior. Unified Resource ordering is unchanged. This refinement made no DB/schema changes, applied no migrations, and did not change generated types; the current generated file was compared to the DEV MCP generator output and matched exactly.
- Node v24.21.0 focused validation for block-first authoring: 28 tests passed across 4 files; `npm run typecheck`, `npm run lint`, and `git diff --check` passed. The later user browser review approved this behavior. Current branch remains `feature/session-resource-library`; all work is uncommitted; no commit, push, merge, deploy, or PROD access occurred.
- Responsive Session Resource picker modal refinement: replaced only the picker Sheet with one large, responsive Radix Dialog; retained the block-first flow and new-block Cancel behavior. The shared Resource Library thumbnail/icon primitive is reused by both the standalone library and picker. No database/backend contracts or generated types changed, and no migration or DEV verifier was run. Node v24.21.0 focused validation passed 36 tests across 5 files: `features/session-builder/session-resource-picker.test.ts`, `features/session-builder/editor-model.test.ts`, `features/session-builder/resource-actions.test.ts`, `features/session-builder/session-editor-presentation.test.ts`, and `features/resource-library/presentation.test.ts`. Typecheck, lint, and `git diff --check` passed. The later user browser review approved this behavior; current branch is `feature/session-resource-library`, work is uncommitted, and no commit, push, merge, deploy, or PROD access occurred.
- Session Resource metadata presentation refinement: added one shared MIME-to-label formatter for supported image, document, audio, and video types. Session Material authoring summaries, picker cards, and the document row in Session Preview now show Resource title followed by concise MIME-derived file type and formatted size; filename extensions cannot override the actual MIME label, and ordinary Session UI omits the original filename. The standalone Resource Library detail sheet remains unchanged and continues to show the original filename and MIME type for management/provenance. No filename/storage behavior, database/schema/RPC/RLS/generated types, or migration was changed.
- Node v24.21.0 focused validation passed 55 tests across `features/resource-library/policy.test.ts`, `features/session-builder/session-resource-picker.test.ts`, `features/session-builder/session-preview.test.ts`, and `features/session-builder/session-editor-presentation.test.ts`. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. The later user browser review approved this behavior; no DEV verification was needed or run for this presentation-only change. Current branch is `feature/session-resource-library`; work remains uncommitted, with no commit, push, merge, deploy, or PROD access.
- Video / Link row icon refinement: added the existing Lucide `ExternalLink` icon inside the same 12-unit muted, brand-blue icon container already used by Audio and Document Resource rows. Existing Video / Link title/URL/description authoring, controls, staged behavior, validation, persistence, reordering, and Preview logic remain unchanged. Added a focused presentation assertion without pixel-level styling checks. No database, migration, Resource Library, picker, resource-model, authorization, generated-type, or Save/Publish changes.
- Node v24.21.0 final regression gate: `npm run typecheck`, `npm run lint`, `npm test` (474 tests across 82 files), `npm run build`, and `git diff --check` passed. Browser review is user-approved. DEV migration `20260930194424_session_resource_library_integration` remains recorded for `lctkqjjkhpyootwvttvj`; the existing rollback-only verifier had passed previously, but this final closeout re-run was rejected by the MCP safety layer before execution because its temporary writes are not read-only. No fixtures were created during the rejected attempt. Generated types were checked against the current DEV generator output for the expected Resource fields and FK relationship; no regeneration was needed.
- Exact next product milestone: DISCUSS / DESIGN ASSIGNMENT INTEGRATION WITH EXPLICIT HISTORICAL RESOURCE-VERSION PINNING.
Selective Page assignment
Counselor can choose specific Session Pages for each couple.
Important:
- reference stable Page identities;
- do not use visual index as identity;
- allow different couples to receive different Page selections.
Future Couple-specific/assignment Resource-selection behavior remains to be designed; the current authoring picker is not an assignment workflow.
Participant Session Material and Homework (implemented October 13, 2026): Couple Workspace is an overview; `/workspace/sessions/[caseSessionId]` presents the authorized released/pinned snapshot with shared Preview page navigation and `Session Material` / `Homework` tabs. The tab reuses partner-scoped Homework loading and the existing save/submit RPC actions. Homework responses remain private to the signed-in partner. Preserve these snapshot and privacy contracts in future work. Counselor review/reopen workflows remain deferred.
Assignment UI
Eventually support counselor/admin assignment of:
- Session Pages;
- Resources if later approved;
- Homework published versions.
Existing assignment/version-history integrity must remain intact.
October 13, 2026 — Phase 3C Meeting Invites divider spacing refinement
- Matched the divider spacing above and below the line: the Meeting Invites section retains `mt-6` above its divider and now uses `pt-6` below it. The heading-to-first-partner-row `mt-1` spacing, colors, divider style, rows, and behavior are unchanged.
- Focused tests passed (17 tests across 2 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No behavior/data/lifecycle/notification/permission change; no migration; PROD untouched. Branch `main`; worktree remains dirty, uncommitted, and unpushed.

October 13, 2026 — Phase 3C Session-card visual hierarchy adjustment
- Changed the consolidated card’s Homework and Meeting Invites headings to the existing `text-brand-secondary` token. Increased the Meeting Invites section gap to `mt-6` and reduced its inner top padding to `pt-2`, yielding approximately 33px between preceding Homework content and the heading without increasing internal row spacing.
- Focused tests passed (17 tests across 2 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No behavior, data, lifecycle, notification, or permission changes; no migration; PROD untouched. Browser retest remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.

October 13, 2026 — Phase 3C Counseling Case Session card consolidation
- Consolidated Session details, upcoming Meeting, Homework, and Meeting Invites into the main Session card in that order. The active authored Session is labeled `Current`; its scheduled Meeting is labeled `Upcoming Meeting`. Session 0 continues to show Session 0 / Initial Meeting and describes its Meeting as upcoming only when one is scheduled.
- The highlighted Meeting row reuses the existing deterministic date/time formatter, location, and calendar icon. Previous Meeting history remains available within the same Meeting section. Homework statuses retain the existing progress label semantics, now showing partner first names where available with safe full-name fallback; response content remains hidden. Meeting Invites still use their existing partner rows, newest status, history Sheet, and Next Step resend actions.
- Removed the separate Current Session, Current Homework, and Next Meeting summary cards. The right rail now contains Counseling Status → Prepare & Enrich → Next Step → Progress; the existing Progress value/bar and DEV Reset placement are unchanged. No lifecycle or notification behavior changed.
- Focused tests passed (36 tests across 4 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser retest remains pending. No migration or DEV/PROD data change. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser retest the consolidated Session card and four-card rail at desktop and mobile widths, verify the Current/Upcoming distinction and Homework/Meeting Invite order, then continue Phase 3C lifecycle verification.

October 13, 2026 — Phase 3C Safari pointer hit-testing audit (runtime unresolved)
- Read-only source audit covered global CSS, WorkspaceShell/sidebar/mobile header, the Counseling Case route and page, Next Step split button, shared Sheet/DropdownMenu portals, and Meeting Invites history Sheet. No full-page pseudo-element, persistent app-shell overlay, or `forceMount` overlay was found. The fixed desktop sidebar is confined to the left rail; the mobile header is sticky and hidden at desktop widths.
- Shared Sheet overlays are `fixed inset-0 z-50` and accept pointer input while their Radix dialog is open. The Counseling Case scheduling Sheet and Meeting Invites history Sheet are controlled and start closed; mobile navigation Sheet starts closed. Dropdown content is portaled only while its menu is open. Source does not show a stale overlay path, but cannot rule out a Safari runtime layer.
- `app/globals.css` gives enabled buttons pointer cursor and disabled buttons not-allowed; its focus rule only removes outline/shadow and applies brightness. Counseling Case main content has no transparent full-page link layer. The separate Sessions workspace card does use an absolute `inset-0` anchor, but it is confined to the card listing and is not rendered on the Counseling Case detail page.
- Could not conclusively identify the element receiving the pointer: Safari `elementFromPoint()`/`elementsFromPoint()` inspection is unavailable because “Allow JavaScript from Apple Events” is disabled, and no Safari WebDriver session was available. No code was changed. PROD untouched; branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Manual capture needed: in Safari Web Inspector Console on the affected Counseling Case page, run the hit-test snippet supplied in the audit handoff and provide its button center coordinates, `elementFromPoint()` result, and `elementsFromPoint()` stack with each element’s tag, `data-slot`, class, bounding rect, position, z-index, pointer-events, opacity, visibility, and display. Also capture open `[data-slot="sheet-overlay"]`, `[data-slot="sheet-content"]`, and `[data-slot="dropdown-menu-content"]` elements at the same coordinates.

October 13, 2026 — Phase 3C Counseling Case timestamp hydration fix
- Root cause: Meeting Invite timestamps called `Date.toLocaleString("en-US", ...)`, which allowed ICU versions to emit different connector punctuation (`at` versus comma). Its timezone was implicit. The same implicit locale formatting was used by the Counseling Case page for upcoming and previous Meeting dates.
- Added a shared formatter using explicit `en-US`, explicit `America/Los_Angeles` (the current project environment timezone; no application timezone setting exists), `Intl.DateTimeFormat.formatToParts()`, and fixed string assembly. Invite/history timestamps render `Oct 13 at 9:17 AM`; existing upcoming/previous Meeting labels keep their date-and-time content with deterministic punctuation. No client-only or hydration-warning workaround was added.
- Focused tests passed (28 tests across 3 files), including fixed-timestamp server markup, history formatter reuse, exact punctuation, and Counseling Case upcoming/previous Meeting formatter wiring. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No lifecycle/notification semantics or data changed; no migration; PROD untouched. Browser retest remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact browser retest: (1) hard refresh the Counseling Case page and confirm no hydration error; (2) then retest split-button pointer and dropdown highlight states in Safari.

October 13, 2026 — Phase 3C shared dropdown and split-button interaction states
- The Next Step primary action and dropdown-arrow trigger have direct `cursor-pointer` styling and explicit `disabled:cursor-not-allowed` fallbacks, independent of global button selectors. Their enabled behavior and structure are unchanged.
- The shared shadCN `DropdownMenuItem` uses Radix `data-[highlighted]` surfaces for pointer/keyboard navigation, warm-neutral styling for normal items, danger styling for destructive items, and disabled-state cursor/background overrides. Labels and separators remain non-interactive. Existing menu order and actions are unchanged.
- Added focused coverage for both split-button controls and disabled cursor fallbacks, Radix highlight classes, destructive/disabled item styling, and rendered Next Step action order. Focused tests passed (18 tests across 2 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Safari/browser retest remains pending. No migration or lifecycle/notification change; DEV and PROD untouched. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: retest the Next Step split-button and dropdown hover, keyboard focus, destructive/disabled treatment, and cursor behavior in Safari, then continue Phase 3C lifecycle verification.

Critical rules for a fresh AI
A fresh AI taking over this project should remember:
1. Do not create coding-agent prompts without discussing behavior and getting approval first.
2. Always read AGENTS.md.
3. Follow the reuse-first rule.
4. Do not touch PROD without explicit approval.
5. Use Marriage Ministry DEV only when DB work is approved.
6. Keep Session and Homework persistence models separate underneath one unified authoring UX.
7. One visible lifecycle belongs to the Session.
8. Homework history/versioning must remain immutable once assigned.
9. Existing assignments must not silently move to newer Homework versions.
10. Pages are Session Material rich_text; external Video / Link uses video_link. The applied integration adds one library_resource type for Image / Document / Audio / Video; no existing block values are renamed.
11. Homework Rich Text remains called Rich Text. Session Material Rich Text is called Page.
12. Preview uses current staged content and performs no persistence.
13. Future Page assignment must use stable Page identity.
14. Preserve shared authoring/rendering components rather than creating parallel copies.
15. Do not merge state models merely because their code looks similar.
16. Use focused validation during development; full suite only at milestone gates.
17. Use Node 24 for milestone validation.
18. Current branch is `feature/session-resource-library`, branched from clean `main`; Preview merge `a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2` and Resource Library merge `eb6cdd5` remain on main.
19. Update PROJECT_STATE.md before considering every coding-agent task complete, including validation and Git milestones.
20. Record browser/manual verification only when actually performed.
21. Preview and standalone Resource Library are regression-validated, browser/manual reviewed and approved, and merged to main. Resource Library foundation `863e526` and completion `cbb562d` are included in merge `eb6cdd5`. Session Material integration passed its DEV migration/verifier gate; user browser review is next.

October 13, 2026 — Phase 3C optional Homework publish and release
- Root cause: the Session/ Homework transaction coordinator treated a null target Homework version as unavailable whenever an Homework root existed, and first activation / next-Session RPCs required a published Homework version. The `case_sessions` schema also required an assignment revision and paired Homework release timestamp, while program completion applied the Homework submission gate unconditionally.
- Null `target_homework_version_id` with `save_homework=false` now means the Session intentionally has no released Homework: publishing succeeds without creating an empty root/version or changing any existing unpublished draft. A stale non-null selection remains an error with corrective author-facing wording. Valid selected Homework versions retain existing versioning and publication behavior.
- DEV forward migrations `20261013120000_optional_session_homework.sql` and `20261013121000_validate_homework_selection.sql` allow a null assignment revision and null Homework release timestamp together while requiring Material release; activation and progression pin Homework only when a non-empty published Homework version exists. Current-session Homework gates and exact Admin/Super Admin `OVERRIDE` semantics remain when an assignment exists. Explicit Final Session enforcement is preserved. No-Homework activation creates no Homework assignment/progress and still snapshots Material and schedules the Meeting. Couple Homework queries and reminder code short-circuit null revisions; 72-hour Homework reminders stay skipped and the 24-hour Meeting reminder remains available.
- Linked DEV history was aligned through `20261013110000` before the first migration; dry-run showed only the corresponding new migration each time. Both forward migrations were applied to linked DEV only. Session 2 `new session` and other DEV content were not modified. No PROD project was inspected or touched.
- Generated type refresh was attempted after migration. `supabase gen types --linked` is blocked by an invalid legacy CLI management token; the database-URL path is blocked because Docker/Podman is unavailable. After the CLI error payload was accidentally redirected over the pre-existing dirty generated-types file, that file was restored from the closest recoverable local generated snapshot. This snapshot predates the current nullable columns and `sessions.is_final`; no generated types were hand-edited. Narrow typed boundaries in the Session Builder and Counseling Sessions queries keep TypeScript safe without `any`. A proper DEV type regeneration remains outstanding.
- Focused validation passed: 80 tests across 9 files (Session Builder/Homework, lifecycle, Couple Workspace, and reminders); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No full suite, build, or knip run. Browser verification remains pending; do not publish or otherwise mutate DEV Session 2 during the browser check. PROD untouched. Branch `main`; pre-existing worktree changes remain uncommitted/unpushed, with this task's changes added.
- Exact next step: reopen Session 2 `new session` in Session Builder and confirm there is no Homework blocker while checking any legitimate Session Material blocker; do not click Publish. Then run the no-Homework lifecycle path using the disposable Phase 3C Couple fixture.

October 13, 2026 — Phase 3C Schedule Next Session Homework-gate UX
- The `Complete Session & Schedule Next` sheet keeps the next Session selector visible while required Homework is incomplete. The Homework section is now a compact `Homework status` area with a concise blocker, first-name partner rows, and the existing progress labels. Meeting date/time controls remain hidden until required Homework is complete or an Admin/Super Admin enters exact uppercase `OVERRIDE`.
- Admin override is presented as a secondary expandable action. The existing server action and RPC confirmation remain unchanged; Homework response/status data is not modified by the override. No override UI is rendered for other roles. Sessions with no assigned Homework revision are presented as requiring no Homework; an assigned revision whose status is unavailable remains blocked.
- Reused the installed Radix Collapsible primitive through a small shared shadCN wrapper because the repository had no existing Collapsible component. The selector continues to display the stored template sequence number. Audit result: this number comes from `sessions.sequence_number`, not Couple `actual_sequence`; Session Builder instead displays rank among all templates. No numbering change was made because safely matching the Builder display requires separating the template display rank from the template sequence used for progression.
- Focused lifecycle controls tests passed (14 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration, database access, lifecycle/server behavior, notification behavior, or role authorization change. Browser retest remains pending. PROD untouched. Branch `main`; existing worktree changes remain uncommitted and unpushed.
- Exact next step: browser retest the incomplete Homework sheet as Coach/Counselor/Campus Lead and Admin/Super Admin, confirm date/time fields remain hidden until completion or valid override, then continue Phase 3C lifecycle verification.

October 13, 2026 — Phase 3C Admin override disclosure-row UX
- Reused the shared Radix/shadCN Collapsible for Admin/Super Admin Homework override. The full-width trigger row has a 44px minimum height, pointer cursor, warm-neutral hover and keyboard focus backgrounds, medium label, muted helper copy, and a right-aligned chevron that rotates when expanded. No standalone button styling or decorative outline was added.
- The short helper remains visible while collapsed; the exact `OVERRIDE` input and outstanding-Homework warning appear only when expanded. Collapsing clears the confirmation so fields cannot remain enabled with a now-hidden confirmation. Existing exact-uppercase client gating and server/RPC enforcement are unchanged; other roles do not render the disclosure. No lifecycle, Homework, or authorization behavior changed.
- Focused lifecycle controls tests passed (14 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration, DEV access, or PROD access. Safari/browser retest remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify Admin/Super Admin disclosure hover, keyboard focus, expanded chevron, collapsed/expanded helper and input visibility, and that collapsing clears the confirmation and hides scheduling fields.

October 13, 2026 — Phase 3C Admin override disclosure surface refinement
- The disclosure trigger now uses the existing warm-neutral `bg-surface-muted` token while collapsed, `bg-sidebar-accent` for hover and expanded states, and retains the existing `focus-visible:bg-surface-muted` keyboard treatment. Expanded content uses `bg-surface-muted`; no hard-coded colors, border, or ring were added.
- Copy, chevron, hit area, spacing, disclosure behavior, confirmation reset/validation, Homework gate, and authorization are unchanged. Focused lifecycle controls tests passed (14 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD access. Safari/browser retest remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser retest collapsed, hovered, focused, and expanded disclosure surfaces in the Schedule Next Session sheet.

October 13, 2026 — Phase 3C Couple Workspace overview and Session View
- `/workspace` is overview-only: it shows Current Session with `Open Session`, a compact signed-in-partner Homework status/no-Homework summary that links to the Homework tab, Next Meeting, progress, Counseling Status, Counselor, and Couple Prepare & Enrich. It no longer fetches or renders Session Material blocks or the Homework response form.
- Added `/workspace/sessions/[caseSessionId]`, requiring an authenticated Couple role. The query resolves `get_current_couple_case_team`, then filters the case-session instance by both its ID and that Couple's case. It reads only released `case_session_material_blocks`, uses the snapshot's pinned Resource version/category/title/description, and never queries mutable Session Builder content. The shared Preview read-only Material renderer provides one-page-at-a-time navigation; shared Tabs provide `Session Material` and `Homework`.
- Homework data comes from the `case_sessions.homework_assignment_revision_id` snapshot. Progress is filtered to the authenticated profile and answers are fetched only by that profile's progress ID. Existing save/submit RPC actions and form component are reused; completed Sessions render Homework read-only. `/workspace/homework` remains a valid reminder/deep-link compatibility page and reuses the same participant Homework component. Its behavior and reminder target are unchanged.
- Resource signing now permits a Couple only an explicit version pinned to an active/completed Session in the Couple's own case; generic Resource browsing remains restricted to the existing administrative/author roles. This reuses existing RLS and introduces no migration.
- Focused validation passed: 61 tests across 9 files (Couple Workspace, Session View/query boundary, pinned Resource signing, Workspace routing, reminder compatibility, and shared Preview); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No lifecycle action or email was triggered, the disposable Couple was not modified, and PROD was not touched. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify Couple `/workspace` overview, open the active Session, both tabs and page navigation, pinned Resource opening, private Homework save/submit, no-Homework state, and existing `/workspace/homework` reminder deep link.

October 13, 2026 — Phase 3C Couple Session Material reader width
- The dedicated Couple Session View opts the shared `SessionMaterialPreviewContent` into a full-width layout. Its page count, Material card, Previous/Next navigation, and pinned Resources now span the available Session View content width; the existing internal page padding remains. The page container retains its normal responsive width and padding, and Homework layout is unchanged.
- Session Builder Preview keeps its prior centered `max-w-3xl` layout by default. Released snapshot rendering, pinned Resource access, tabs, page navigation behavior, and lifecycle semantics are unchanged. No migration or DEV/PROD access.
- Focused validation passed: 17 tests across Couple Session View, its query boundary, and shared Session Preview; `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify `/workspace/sessions/[caseSessionId]` at desktop and mobile widths, including full-width Page X of Y, Material page/card, Previous/Next navigation, and Resources; confirm no horizontal overflow and that the Homework tab is unchanged.

October 13, 2026 — Phase 3C Couple Session View shared horizontal grid
- Couple Session View tab content now uses the same outer horizontal grid as the back link, Session heading, and tabs. Removed the Material tab's extra outer horizontal padding and the Homework tab's centered `max-w-3xl` wrapper; the shared Material reader and Homework content now extend to the same content edges. Material card-internal padding, outer page padding, and responsive page width remain intact.
- Material paging, Resources, released snapshots, Homework validation/data/save/submit/privacy, and all lifecycle behavior are unchanged. Focused Couple Session View/query-boundary/shared-preview tests passed (17 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify title, tabs, Material and Homework share left/right edges at desktop and mobile widths; confirm card padding remains comfortable, no horizontal overflow, and Material navigation/Resources and Homework controls remain unchanged.

October 14, 2026 — Phase 3C Couple Session View standard page width
- The dedicated Couple Session View now uses the Couple Workspace outer shell convention, `mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10`, instead of the narrower `max-w-5xl`. Breadcrumb, Session heading/status, tabs, Material, and Homework all share this container. No special reading width was added; content remains full-width within the application shell.
- Material/Homework rendering, data, tab and navigation behavior, Resources, lifecycle, permissions, and privacy are unchanged. Focused Couple Session View tests passed (5 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser compare Couple Workspace and dedicated Session View widths at desktop, then check normal mobile page padding and no horizontal overflow across both tabs.

October 14, 2026 — Phase 3C Couple Workspace shell and navigation alignment
- Added a small Couple breadcrumb component using the existing shared shadCN Breadcrumb primitives. `/workspace` shows `Workspace / Couple Workspace`; the dedicated Session View uses `Workspace / Session N`, with Workspace linked to `/workspace`. The standalone `← Couple Workspace` link was removed. Breadcrumbs include intermediate items only when they are distinct real destinations; placeholder labels that route to the same destination are omitted. No Builder/admin route is linked.
- Couple Workspace now matches the counselor case-detail shell: `max-w-[1100px]`, breadcrumb above a `gap-6` two-column layout, `minmax(0,1fr)` main column, and `17rem` right rail. Partner avatars, Couple Workspace eyebrow, Couple name, and helper copy are in a white/surface header card in the main column. The overview cards remain below it. Right rail order is Counseling Status, Counseling Team, Prepare & Enrich. No staff controls are exposed.
- Dedicated Session View remains a single-column reader at its existing `max-w-[1100px]` width. Material/Homework tabs, snapshots, private Homework behavior, Resources, navigation, lifecycle, permissions, and privacy are unchanged.
- Focused Couple Workspace and Session View tests passed (15 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migrations, lifecycle actions, emails, DEV access, or PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify Couple Workspace against the counselor case shell at desktop/mobile widths, breadcrumbs and back navigation on both Couple routes, right-rail order, and continued single-column Session reading without overflow.

October 14, 2026 — Phase 3C Couple Session breadcrumb and Material tab header
- Reused the existing Breadcrumb primitives in the counselor Counseling Case pattern to show `Workspace / Session N` on the dedicated Couple Session View. Workspace links to the Couple Workspace; the current Session number is the final non-clickable crumb. The rounded standalone back-link treatment and arrow are absent. Only include intermediate breadcrumb items when they represent a distinct real destination; omit placeholder hierarchy labels that route to the same destination as another crumb.
- The Session Material tab row places the left-aligned tabs and right-aligned `Page X of Y` together. Page number updates through the existing reader navigation state callback; the reader's Previous/Next behavior is unchanged. The count is omitted for Homework. A wrapping flex row lets the count move below the full-width mobile tabs without constraining tab width or causing horizontal overflow. Shared Session Builder Preview retains its inline page-count default.
- Focused Couple Session View/shared Preview tests passed (15 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration, lifecycle action, email, DEV access, or PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify counselor-style breadcrumbs, desktop tabs/count alignment, mobile row wrapping, and Homework tab count omission while checking existing page navigation.

October 14, 2026 — Phase 3C Couple Session breadcrumb hierarchy simplification
- The dedicated Session View breadcrumb is `Workspace / Session N`: `Workspace` links to `/workspace`, and the actual released Session number is the non-clickable current crumb. Removed the duplicate-destination `Sessions` crumb. Shared breadcrumb presentation is unchanged. The convention is to include intermediate breadcrumbs only for distinct real destinations.
- Focused Session View tests passed (5 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Session, Material/Homework, lifecycle, permissions, privacy, and routing behavior are unchanged. No migration or DEV/PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser verify the Session View displays only `Workspace / Session N`, with Workspace linking to Couple Workspace and no intermediate Sessions label.

October 14, 2026 — Phase 3C participant Homework block spacing
- The large blank area came from `RichTextReadOnly` applying `min-h-40` to its Tiptap surface. Added a compact presentation option and use it only for participant Homework Rich Text and Long Answer prompts. Default read-only rendering (including Session Material) and the Rich Text authoring editor retain their existing minimum height and typography. Homework cards have no added fixed/minimum height.
- Participant Long Answer textareas now use the existing `min-h-32` scale (128px), remain user-resizable, and retain their five-row default. Response labels, save action, submit action, validation, and server actions are unchanged. Both the dedicated Session tab and `/workspace/homework` use the same participant renderer, so spacing is consistent.
- Focused Homework/Session View/Rich Text tests passed (12 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No lifecycle or authorization change, migration, or DEV/PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser-check a short Rich Text block and Long Answer block in the Couple Session Homework tab and `/workspace/homework`; confirm natural card height, the 128px resizable response area, and unchanged save/submit behavior.

October 14, 2026 — Phase 3C tab-aware Couple Session View header
- The dedicated Session View page heading now follows the selected tab. Material retains its Session title/status (including the existing completed-Session presentation) and shows `Page X of Y` in the tab row. Homework shows `Session Homework`, the pinned assignment title, and the signed-in partner's existing progress label as a Badge; when there is no Homework assignment, the heading uses the shared `${sessionTitle} Homework` convention and omits a status badge.
- The participant Homework renderer accepts `showHeader={false}` for the Session View, removing its duplicate Homework title/status while retaining the default heading on `/workspace/homework`. The Homework block / empty state begins below the tabs. Shared title formatting is used by both participant data queries. Homework answers remain profile-scoped; no other partner status or answer is included.
- The Material tab panel stays mounted while changing tabs so its selected page is retained. Breadcrumb and tab route behavior, released Material, Resources, Homework save/submit, lifecycle, permissions, and privacy are unchanged.
- Focused Session View, participant Homework, and query-boundary tests passed (17 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration, lifecycle action, email, DEV access, or PROD access. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser-check active Material and Homework headings, all four partner Homework status labels, no-Homework header/empty state, tab switching without losing Material page position, and unchanged save/submit behavior.

October 14, 2026 — Phase 3C participant Homework Submitted badge
- The participant Homework status badge in the dedicated Couple Session View now uses the existing `bg-success-soft text-success-strong` treatment only for `Submitted`. `Not Started`, `In Progress`, and `Reviewed` retain their existing neutral styling; badge size, shape, spacing, typography, and status text are unchanged. The shared view applies this consistently wherever the participant status badge is rendered.
- Focused Session View tests passed (9 tests), including explicit styling assertions for all four statuses. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No Homework behavior, migration, DEV/PROD access, or lifecycle behavior changed. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser-check Submitted as green and the other three Homework statuses unchanged in the Couple Session Homework tab.

October 14, 2026 — Phase 3C shared Homework status badge mapping
- Added one Homework presentation mapping shared by the Couple Session View and counselor Counseling Case Session card: `Not Started` uses soft neutral, `In Progress` uses soft blue/accent, and both `Submitted` and `Reviewed` use soft green/success. Counselor partner rows now render these statuses as compact badges; Couple badge styling follows the same mapping.
- This is presentation-only. Status values, Homework response privacy, saved/submitted/reviewed behavior, and the progression gate are unchanged; the existing lifecycle regression test still checks that Submitted or Reviewed satisfies the gate. No migration or DEV/PROD access.
- Focused Counseling Case, Couple Session View, and lifecycle migration/gate tests passed (46 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Browser verification remains pending. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser-check the four shared status treatments in both counselor and Couple Homework presentations.

October 14, 2026 — Phase 3C Partner Two DEV login repair
- Read-only audit against linked DEV `lctkqjjkhpyootwvttvj` found exactly one Auth user for Partner Two at the existing fixture Auth/profile ID `7b058708-776a-4391-a870-9e391b8fb482`. Email is confirmed, account is not banned or anonymous, the profile is active, and its sole active group membership is the existing Couple group `28a7596e-e8ca-4817-bce2-9149a3aeec7d`. Both original partner profiles remain the two active members. No duplicate Auth user was found.
- The prior password value itself could not be diagnosed without exposing or testing it. Since the user reported login failure and the existing account/profile/membership were correct, reset only this Auth user's password to the value already stored in local `.env.local`; no Auth user recreation, email/profile ID change, membership, invitation, Couple, assignment, Homework, Session, Meeting, or case mutation occurred. Sign-in using that local value then succeeded with the same Auth ID. The prior cause is therefore narrowed to stale/mismatched Auth password state versus the locally stored Phase 3C credential; the old value was not exposed or compared.
- Read-only verification also observed the existing counseling case `3ffef734-b8a6-4417-aca9-bd43041a9d17` currently has status `active` and remains open. No lifecycle action was run; this differs from the case's earlier matched-state note and was left untouched. No migration, application-code change, or PROD access. `git diff --check` passed. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: sign in as `phase3c-20261012-d59ccc28-two@mailinator.com` in the browser using the existing local Partner Two password, confirm Couple Workspace access, and stop before any lifecycle action.

October 14, 2026 — Phase 3C Partner Two app sign-in diagnosis
- Environment check: `.env.local` resolves `NEXT_PUBLIC_SUPABASE_URL` to linked DEV ref `lctkqjjkhpyootwvttvj`; `.envrc` has no direct Supabase URL assignment, and no `.env.development*`/`.env` override files exist. `.env.example` contains only a placeholder and is not loaded by `next dev`. The currently served `/login` bundle was inspected without exposing keys: the chunk containing the login submit call contains the expected DEV project ref. `package.json` runs the app with `next dev`. The exact server process environment was not readable through the available process metadata, but server auth uses the same `getSupabaseEnvironment`; importantly, the inline credential error is emitted by the browser auth call before server-side session/identity routing.
- Login path: `LoginForm.handleSubmit` submits the raw email/password state (no trim or normalization) to `createBrowserSupabaseClient().auth.signInWithPassword`. Only a returned `signInError` sets `Unable to sign in with those credentials.`. A successful call navigates to `/auth/entry`; auth-entry/session validation can redirect for activation or access with different outcomes/messages. The proxy only refreshes claims and does not translate auth errors into the inline credential message.
- Compared both fixture users through the app's `createBrowserClient` constructor and the same `signInWithPassword` call, using their existing local credentials and the configured DEV URL/key. Partner One succeeded; Partner Two succeeded and returned the known Auth ID. Both configured local emails match their fixture addresses. No password was reset and no auth/profile/case data was changed. No tokens, passwords, or keys were logged.
- Diagnosis is unresolved for the reported Safari/browser failure: current served login code targets DEV and both users pass the same SDK auth call from this environment, while the browser network request/input from the failing attempt is unavailable. No application bug is established; a stale tab or browser-entered value remains unverified, not a confirmed cause. No application code, migration, or PROD access.
- Only documentation changed; `git diff --check` passed. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: fully reload `/login`, re-enter Partner Two's exact email and the existing local password, and retry. If the inline generic error persists, capture only the Auth token endpoint HTTP status and safe `error_code`/message from the Network panel (never request payload, password, key, or tokens), and note whether the URL ever reaches `/auth/entry`.

October 14, 2026 — Phase 3C Session numbering contract audit (read-only)
- Linked DEV `lctkqjjkhpyootwvttvj` contains two Session rows, both published and `is_final = false`: `testing` ID `a9fd02be-c25f-4653-9447-8111fbc1b7c4`, stored `sequence_number = 1`, created 2026-09-21; `new session` ID `dea33995-6cd6-4462-85c4-ba57dc77eb79`, stored `sequence_number = 10`, created 2026-09-24. There are no current draft/archived Session rows and no `deleted` status/column. The Session entity audit query returned no rows. Identity values 2–9 are absent, but available records do not establish whether those allocations came from deleted rows, failed/rolled-back inserts, or another sequence advance; identity gaps are expected and must not be treated as user-visible curriculum numbers.
- Root cause: `sessions.sequence_number` is a generated, unique identity/order key and is gap-prone. Session Builder sorts by it, then `withCurriculumNumbers()` assigns array positions (1, 2); the edit page independently counts all lower sequence values. In contrast, Counseling Session queries map published `sequence_number` directly to `Session.number`, so the Next Session selector renders `Session 10`. The new Session is `published`, and the discrepancy is not caused by status or final-session state.
- Current numbering semantics: (1) Builder list/edit: derived rank among every extant Session row sorted by `sequence_number`; status filtering happens after ranking, so draft and archived rows affect positions. Create page has no assigned number before insertion. (2) Next Session selector: stored `sequence_number`, published rows only, sorted by that key. (3) Counselor active Session header: `case_sessions.actual_sequence` (fallback to template sequence); counselor Progress is `actual_sequence of published-session-count`. (4) Couple Workspace and dedicated Couple Session heading/breadcrumb: `actual_sequence`; Couple Progress uses that journey ordinal over the published-session count. (5) Lifecycle RPCs snapshot `sessions.sequence_number` into `case_sessions.template_sequence_number`; `actual_sequence` starts at 1 and increments per Couple progression. (6) Existing `case_sessions` snapshots preserve title, template sequence, and explicit `is_final`; final-program completion checks the explicit snapshot flag, not the maximum sequence. (7) Meeting notification text uses the snapshot Session title and does not currently render a Session number.
- DEV currently has exactly one assigned snapshot: active `testing`, case-session ID `b439db27-3d9c-4aa9-a2b3-48bf0216f289`, `actual_sequence = 1`, `template_sequence_number = 1`, `is_final = false`. The existing Phase 3C case is already active with this Session; `new session` has no Couple snapshot. No scheduling, lifecycle, numbering, or other DEV data was changed.
- Recommended canonical contract: keep `sequence_number` as the internal stable ordering key and never display it as `Session N`; use the same Builder rank (all extant Session rows in sequence order, preserving current Builder behavior) for template-facing Session numbers throughout Builder, selector, and assigned Session presentation. Snapshot that rank in the existing `case_sessions.template_sequence_number` at release. Keep `actual_sequence` exclusively for Couple journey progress, and label it as progress rather than using it as the template Session heading. Published status continues to determine eligibility; draft and archived rows retain their ordered slots to match current Builder numbering. Finality remains the explicit `is_final` flag. There is no reorder feature today; any future reorder feature must define its effect on already released snapshot numbers before implementation.
- Smallest likely implementation: shared rank mapping in `features/session-builder/presentation.ts`/`queries.ts`; rank all Sessions when building the published selector in `features/counseling-sessions/queries.ts`; render template snapshot number in `features/counseling-sessions/model.ts`/`couple-detail-page.tsx` and add `template_sequence_number` to Couple Session reads in `features/couple-workspace/queries.ts` for `workspace.tsx` and `session-view.tsx`; keep progress values based on `actual_sequence`. A forward migration is required to update `activate_first_case_session` and `complete_case_session_schedule_next`, the RPCs that write `template_sequence_number`; no schema column is needed. No DEV snapshot backfill appears necessary from the current read (the sole existing snapshot is already 1); do not renumber `sessions.sequence_number`. Regression coverage should protect published ordering, draft/archive rank behavior, out-of-order assignment, progress ordinal, and explicit finality.
- Diagnostic-only validation: DEV reads above; no tests or lifecycle actions run. `git diff --check` passed. PROD untouched. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next step: review and approve the canonical split between template Session number (`template_sequence_number` snapshot) and Couple journey progress (`actual_sequence`); then implement shared rank projection and the forward RPC update without mutating Session ordering in DEV.

October 14, 2026 — Phase 3C canonical authored Session numbering implementation
- Canonical contract implemented: `sessions.sequence_number` remains the gap-prone internal Builder order key and never supplies user-facing `Session N`. A shared `withAuthoredSessionNumbers()` projection ranks every extant template in canonical sequence order before any status filter. Session Builder retains its existing numbering; published lifecycle options now use the same authored rank, so raw keys 1 and 10 display as Session 1 and Session 2. Draft and archived templates continue occupying their Builder positions.
- Assigned Couple Sessions remain historical snapshots. `case_sessions.template_sequence_number` is the authored `Session N` shown by the counselor case, Couple Workspace, dedicated Couple Session heading/breadcrumb, and assigned Homework title. `case_sessions.actual_sequence` remains independent Couple journey order and continues to drive progress values and progression increments. Assigned title/finality presentation also remains pinned to the case-session snapshot.
- Added forward migration `20261014100000_canonical_authored_session_number.sql`, replacing only `activate_first_case_session` and `complete_case_session_schedule_next`. Each RPC ranks all extant templates with `row_number()` before applying published eligibility and snapshots that authored rank. Homework gates/override, actual-sequence increments, explicit finality, Material/Homework release, Meetings, notifications, and authorization are unchanged. No schema/type regeneration was needed. The first apply attempt was rejected before any statement ran because PostgreSQL disallows a rowtype variable in a multi-item `INTO`; the SQL was corrected to rank and load/lock the Session separately, revalidated, and then applied successfully to linked DEV `lctkqjjkhpyootwvttvj`. Migration history is aligned through `20261014100000`; PROD was not inspected or touched.
- Read-only DEV verification after migration: `testing` remains published with raw sequence 1; `new session` remains published with raw sequence 10; the Phase 3C case still has exactly one active case Session (`testing`) with `actual_sequence = 1`, `template_sequence_number = 1`, and no closure. No new case Session or lifecycle progression was created.
- Focused validation passed: 100 tests across 10 Session Builder, counseling case/lifecycle, Couple Workspace, dedicated Session View, and migration files; `npm run typecheck`; `npm run lint`; `git diff --check`. Browser verification remains pending. Branch `main`; the pre-existing Phase 3C worktree remains dirty, uncommitted, and unpushed.
- Exact next browser step: confirm Session Builder shows `testing` as Session 1 and `new session` as Session 2; open the current Phase 3C case’s Schedule Next Session sheet and confirm the selector says `Session 2: new session` while the active counselor and Couple views remain `Session 1`; close the sheet without progressing the fixture.

October 15, 2026 — Phase 3C no-Homework empty-state wording
- Standardized the definitive empty state for a released Couple Session snapshot whose `homework_assignment_revision_id` is null to `No Homework for this Session`. Couple Workspace and dedicated Couple Session View already used this wording; the counselor Session card now matches it.
- Counselor presentation distinguishes a missing/unavailable Homework display when the assigned snapshot does have a revision (`Homework status unavailable.`), and preserves the pre-assignment wording when there is no assigned Session yet. This is presentation-only; no Homework assignments, data, snapshot semantics, gates, authorization, or progression behavior changed.
- Focused counselor / Couple Workspace / Session View tests passed (31 tests across 3 files); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD access. Browser verification was not performed. Branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser-confirm that an assigned no-Homework Session shows `No Homework for this Session` in both counselor and Couple views, while a Session with a missing/unavailable Homework revision is not presented as a definitive no-Homework state.

October 15, 2026 — Phase 3C counseling progress position wording
- Current-position progress now reads `Session X of Y` in both Couple Workspace and counselor Counseling Case progress. The initial state reads `Session 0 of Y`; genuinely completed counseling retains its distinct `Y Sessions completed` wording.
- The label still derives from `actual_sequence` and the same published Session total. The existing counselor progress percentage parser now recognizes the new label; numerator, denominator, bar calculation, and explicit final-session completion authority are unchanged. No lifecycle, numbering snapshot, Homework, Meeting, permission, or data behavior changed.
- Focused model/presentation/counselor/Couple Workspace tests passed (41 tests across 4 files), including `Session 2 of 2`, unchanged position values and full ratio, and no completed-program label for an active Session. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD access. Browser verification remains pending. Branch `main`; existing worktree remains dirty, uncommitted, and unpushed.
- Exact next step: browser-confirm `Session 2 of 2` for the active fixture in Couple Workspace and counselor Progress, and confirm the existing bar remains present while the active Session is not labeled complete.

October 15, 2026 — Phase 3C Initial Meeting case activation
- Corrected the authoritative Session 0 lifecycle contract: `schedule_initial_case_meeting` now locks the open counseling case, accepts only `matched` or `active`, creates or updates the Initial Meeting, and conditionally transitions `matched → active` in the same database transaction. Rescheduling an active Initial Meeting preserves `active`; closed/completed cases cannot be reopened. Future-only Meeting validation, care-team/Super Admin authorization, Meeting notification dispatch, and the RPC signature are unchanged. Session 1 activation remains compatible with an already-active case.
- Root cause: the prior Session 0 RPC created or updated the Meeting but never wrote `counseling_cases.status`; the case did not become active until the later Session 1 activation RPC. Counselor and Couple views already read the same authoritative case status and map `active` to `In Progress`, so no client-derived status was added.
- Added and applied forward migration `20261015130000_initial_meeting_activates_case.sql` to linked DEV `lctkqjjkhpyootwvttvj` only. The existing case-status trigger records the single real transition; the RPC does not add a second history write. No schema/type regeneration was needed. PROD was not inspected or touched.
- Reconciled only Final Session fixture case `754e4d58-a378-4477-ac06-f93e6b878bc0` after guarded precondition checks: status changed from `matched` to `active`; Initial Meeting `22dfbd17-cd1c-4789-98bf-9c68cb9da5d8` remains unchanged at October 16, 2026 4:00 PM America/Los_Angeles; Meeting count remains 1; authored Couple Session count remains 0; the two original delivered notification records remain the only deliveries. One trigger-owned `matched → active` history row was added under the original scheduler. The original Phase 3C fixture `3ffef734-b8a6-4417-aca9-bd43041a9d17` remains active with 2 case Sessions and 3 Meetings.
- Focused migration, counselor status, Couple status, and shared status-label tests passed (63 tests). Rollback-only linked DEV database validation proved failed past scheduling is atomic, successful scheduling activates without creating an authored Session, rescheduling preserves active without another status event, and inactive/finished cases remain terminal. `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Branch `main`; worktree remains dirty, uncommitted, and unpushed.
- Exact next browser step: hard-refresh Final Session fixture case `754e4d58-a378-4477-ac06-f93e6b878bc0` as staff and its Couple Workspace, confirm both Counseling Status cards show `In Progress`, confirm the existing Initial Meeting still shows October 16, 2026 at 4:00 PM, and do not run another lifecycle action.

October 15, 2026 — Phase 3C Couple Workspace Homework status badge
- Couple Workspace now presents the Homework title as `Homework` with the existing shared Homework status Badge immediately beside it. It reuses `homeworkProgressLabel()` and `homeworkProgressBadgeClass()` from `features/homework/presentation.ts`: neutral for Not Started, blue/accent for In Progress, and green/success for Submitted and Reviewed.
- The private-to-you helper remains below the title row. Assigned no-Homework snapshots still show `No Homework for this Session` without a badge; the pre-Session and unavailable-status states are preserved. This is presentation-only; status calculations, partner privacy, pinned snapshots, Homework actions, and lifecycle gates are unchanged.
- Focused Couple Workspace, counselor case, Session View, and Homework tests passed (41 tests); `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No migration or DEV/PROD access. Browser verification remains pending. Branch `main`; dirty worktree preserved, uncommitted and unpushed.
- Exact next step: browser-check the Couple Workspace Homework card for all four status colors and verify that a no-Homework assigned Session shows the definitive empty-state copy without a badge.

October 15, 2026 — Phase 3C Session progression Homework identifier correction
- Confirmed the Final Session progression failure in linked DEV with a rollback-only reproduction. The live `complete_case_session_schedule_next` function declared a PL/pgSQL variable named `homework_id`, then used `ON CONFLICT (homework_id, counseling_case_id)` while assigning published Homework. PostgreSQL could not distinguish the variable from `homework_assignments.homework_id`, producing `column reference "homework_id" is ambiguous`. `activate_first_case_session` already used the unambiguous `selected_homework_id`; Homework helpers and triggers were not the source.
- Added forward migration `20261015140000_fix_progression_homework_identifier.sql`, replacing only `complete_case_session_schedule_next` with the same signature, security definer/search path, authorization, gates, ordering, transaction sequence, optional-Homework path, release behavior, and Meeting creation. The local variable is now `selected_homework_id`, and the selected value is passed explicitly to the assignment insert. Existing grants are preserved by `CREATE OR REPLACE`; no schema or generated-type change was required. Applied successfully to linked DEV `lctkqjjkhpyootwvttvj`; local and DEV migration history are aligned through `20261015140000`. PROD was not accessed.
- Rollback-only DEV verification proved progression into published Session 2 with Homework succeeds, creates one pinned assignment/revision with two partner progress rows, snapshots authored Session number 2 and `is_final = true`, schedules the next Meeting, and preserves both submitted Session 1 responses. A second rollback path proved progression into a Session with no eligible Homework still creates no Homework assignment. A late future-Meeting validation failure proved Session, Meeting, Homework, and notification mutations roll back atomically. Direct RPC verification created no notification deliveries.
- Final Session fixture `754e4d58-a378-4477-ac06-f93e6b878bc0` has since progressed in the browser: case `active`; Session 1 `testing` is completed; Session 2 `new session` is the sole active case Session at actual/template sequence 2 and is pinned Final; Partner One Homework is Submitted and Partner Two Homework is Not Started. The case has 2 case Sessions, 3 Meetings, and 6 delivery rows. Original Phase 3C fixture `3ffef734-b8a6-4417-aca9-bd43041a9d17` remains separate.
- Focused lifecycle/RPC, Homework persistence, query, model, and lifecycle-control tests passed (67 tests). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. Branch `main`; existing dirty worktree preserved, uncommitted and unpushed.
- Exact browser retest is superseded by the assignment-level Homework steps in the newer entry above; do not progress or complete Session 2 while testing draft persistence.
