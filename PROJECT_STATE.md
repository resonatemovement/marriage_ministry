Project State Document — Resonate Marriage Ministry
Last updated: October 8, 2026
Current working branch: main
Repository: resonatemovement/marriage_ministry
Current base: Resource Library merge on main at `eb6cdd5`; Preview merge `a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2`
Current state: Session + Homework Preview, standalone Resource Library, and Session Material Resource Library integration are complete, browser-approved, and merged on main. The Counseling Workspace / Coach Assignment / Couple Presentation milestone is complete and validated on `main`; milestone commit and push are the remaining Git closeout steps. PROD is untouched.
October 8, 2026 — Counseling Workspace / Coach Assignment / Couple Presentation milestone closeout validation
- Final scope includes workspace routing and RPC handling for Campus Lead, Coach, Counselor, and Couple; counseling case/contact drill-downs; shared card/avatar presentation; case-specific Prepare & Enrich documents; active Coach versus Counselor assignment semantics and Coach-specific Admin unassignment; and Couple display-name precedence plus the corrective scheduling-history migration. Existing team-name and Counselor-of-record behavior remains separate.
- DEV migrations `20261007110000_counseling_workspace_couple_identity`, `20261007120000_unassign_coach_case_assignment`, `20261007130000_couple_custom_name_precedence`, and `20261008100000_fix_counseling_case_status_history` are recorded as applied. Local and DEV migration histories are aligned with no unexpected pending or remote-only migration. PROD was not accessed or changed.
- The Couple custom-name edit was confirmed manually in the browser per the user. The optional final clear-to-derived browser check was not repeated during closeout; focused tests cover clear-to-derived behavior. The status-history audit found no prior false `active → active` rows. A live new status-transition row was not generated because DEV has no published Session Homework version, and no test data was created for closeout.
- Final validation passed: `npm test` (557 tests / 106 files), `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. No temporary debug logging or unrelated changes were found. Generated Supabase types correspond to the approved DEV migrations; the final corrective migration does not change types.
- At this state update, branch is `main` with all accumulated approved milestone work still uncommitted; nothing has been committed or pushed. Final handoff will record the resulting commit and push. Exact next milestone: `Couple Session Assignment & Delivery` — design and implement stable Couple-specific Session Page selection and delivery while preserving assignment/version history. Do not begin it in this closeout.
October 8, 2026 — Counseling case status-history correction
- Confirmed defect in the already-applied `20261002100000_counseling_sessions_workspace.sql`: `schedule_case_session_meeting` updated a case to `active` before reading its status into `case_status_history.from_status`, allowing false `active → active` history rows.
- Added and applied new DEV migration `20261008100000_fix_counseling_case_status_history.sql`; the applied migration was not edited. The replacement captures case status while locking the open case, preserves all meeting/session/homework scheduling logic, and records `previous_status → active` only for the existing `requested`, `assessment`, `interviewed`, and `matched` transitions. Already-active cases get no synthetic transition.
- Read-only authenticated DEV audit found no existing `active → active` rows; no history records were changed. There was no published Session Homework version in DEV, so an authenticated live matched-to-active scheduling exercise was not run; doing so would require changing DEV data or creating/publishing fixtures. Existing DEV data was not changed by this validation.
- DEV migration history is aligned with no pending local migrations or remote-only migrations; correction version `20261008100000` is recorded. No other migration was applied. PROD was not accessed or changed.
- Focused counseling-session regression tests passed (20 tests across 4 files, including migration regression assertions for pre-update status capture, real transition-only history, preserved scheduling paths, and the unchanged history reason). `npm run typecheck`, `npm run lint`, and `git diff --check` passed. No generated types changed.
- Current branch remains `main`; all pre-existing approved uncommitted work is preserved along with this correction and state update. Nothing was committed or pushed. Exact next step: resume milestone closeout review, full validation, and the previously authorized commit/push; retain the note that authenticated browser validation for Couple custom-name persistence/display/clear is still outstanding.
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
- DEV MCP authentication was restored and the project URL confirmed as `https://lctkqjjkhpyootwvttvj.supabase.co`. Only the contents of local migration `20260930120000_session_resource_library_integration.sql` were applied to DEV through the MCP; the server recorded version `20260930194424_session_resource_library_integration`. It adds the real `resource_id` FK with ON DELETE RESTRICT, category/content checks, a trigger and transactional save-RPC validation, and a narrow Author read policy for archived Resources already linked from Session Material. The Resource delete RPC's restrictive FK failure is DEV-verified. Current-version lookup is implemented in the application; an actual version replacement and browser playback/download remain unverified. Future assigned/historical consumers must pin a Resource Version separately with explicit FK/reference protection; no assignment/pinning integration exists.
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
Participant Session Material
Eventually implement participant-facing reading experience using the reusable Preview/read-only content components where appropriate.
Do not create a parallel rendering system if Preview components can be reused safely.
Participant Homework
Eventually implement:
- assigned Homework loading;
- participant progress;
- Long Answer response textarea;
- autosave or explicit response saving as separately designed;
- submit;
- read-only after submit;
- counselor review;
- eventual Reopen workflow.
Existing Foundation rules must be preserved.
Assignment UI
Eventually support counselor/admin assignment of:
- Session Pages;
- Resources if later approved;
- Homework published versions.
Existing assignment/version-history integrity must remain intact.
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
