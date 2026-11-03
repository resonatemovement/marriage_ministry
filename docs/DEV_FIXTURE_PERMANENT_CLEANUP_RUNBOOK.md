# DEV fixture permanent-cleanup runbook (preparation only)

**Status: BLOCKED — do not execute.** This runbook records a read-only preflight for the five expressly approved DEV Couple/Case fixtures. It is not a deletion script or authorization to delete. No database or Auth records were changed while preparing it.

## Environment and recovery gate

- Intended project: Supabase DEV `lctkqjjkhpyootwvttvj` (`Marriage Ministry Dev`, `ACTIVE_HEALTHY`, `us-west-1`, PostgreSQL `17.6.1.155`). The linked project-ref and `.env.local` URL both resolve to this ref. All SQL checks in this review explicitly targeted that ref.
- The Supabase Management API `GET /v1/projects/lctkqjjkhpyootwvttvj/database/backups` returned HTTP 200 with **zero backup records**. The read-only backups-schedule endpoint returned HTTP 402, so its configuration could not be verified. No current PITR restore window, physical backup, or independently restorable snapshot was demonstrated. An empty list is not proof that no out-of-band backup exists; the restore capability remains unverified.
- Therefore recovery of database rows plus the ten Auth identities, their IDs, password hashes/session continuity is not established. A standard Auth Admin deletion is external to a Postgres transaction, and creating a replacement user through the normal Auth API does not guarantee the same Auth UUID or authentication continuity. No candidate-owned Storage objects or candidate-UUID paths were found; preserve the shared Resource and its underlying object. Database backups do not contain Storage object bytes, so if a later preflight finds candidate-owned objects, separately protect them before proceeding. Supabase's current backup documentation describes project/plan-dependent daily backups and PITR, and explicitly excludes Storage object contents: [Database Backups](https://supabase.com/docs/guides/platform/backups), [Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project).
- **Mandatory stop:** Before any future execution, an operator must verify in the DEV Dashboard/Management API a restorable full-project backup or PITR point, demonstrate recovery of the ten exact Auth IDs to an isolated clone or otherwise document an approved same-project restore procedure, confirm recovery-point and data-loss impact, and reconfirm the candidate/shared Storage inventory. Do not begin cleanup until this is complete and the user separately authorizes execution.
- Supabase's documented restore affects the project as a whole and entails downtime; restoring an earlier point can discard subsequent writes. A backup/clone validation is not the same as a successful same-project restore drill. No live restore or clone was attempted here.

## Exact allowlist and verified identity

Only these five group/Case pairs and their ten Couple members were in scope. At review time every group and Case existed with matching IDs; each group was `couple`, active, and had two active members; each Case's `couple_group_id` matched the listed group. All ten profile IDs equaled their Auth user IDs, all ten Auth users and identities existed, and each profile had one active Couple membership and one Couple role row. No candidate member had another group membership, invitations, assigned/created Case references, in-app notification, audit-actor reference, Assessment assignment/attempt reference, or profile photo/storage path. Fourteen Case delivery rows do reference candidate profile IDs as recipients; they are Case-owned rows scheduled to cascade with their Case and must be counted/verified before the later Auth deletes.

| Fixture | Couple group ID | Case ID | Partner A profile/Auth ID | Partner B profile/Auth ID | Case state |
|---|---|---|---|---|---|
| Realtime Meetings Test | `9554f01a-d22f-409b-9255-2108c0f9e1a5` | `95eac800-d449-4d06-9555-cf13c7a178c7` | `cb39813c-82d1-4a6f-8259-409ce1b92f91` | `9a6eecaf-e601-41e0-a7e5-b0e59839695a` | active |
| Realtime Case Closure Test | `172fbabd-1d5a-40dd-bd86-97e318f7b97d` | `1bc549ee-5c8e-4037-84d6-bdc3c295837b` | `1bc7683d-b4d7-4ea2-949c-10052ca52568` | `04ba2223-4a7d-493d-b149-ed3cbc2959e3` | active |
| C2 Final Realtime Verification | `6b824020-fd60-40e3-ac83-eb3ddc8812c1` | `ef59520b-6e29-40c1-877a-6773e2c6e58e` | `807e62a5-026c-4f20-91d4-66b12e6adbe3` | `4d987dd3-5f4c-4a1c-b86d-b1e3bb94113f` | active |
| Selective Session Content Test | `ae442afe-3e34-43f4-8060-422c489988ce` | `37431ff7-a887-4953-9e00-a276fe78817c` | `7e79c47d-812c-4f86-9ee2-d298823ea6cf` | `ba2ade58-434d-4d8a-a44d-130c2e37abe7` | active |
| Final Resource Pinning Test | `639b63c0-832b-445c-bc50-dd0f1a95d832` | `9f85cf1c-8bae-491e-a18b-4ef315b04871` | `dfe85687-12af-4ef2-a99a-f7af7d1268af` | `0e187e77-d42f-4df9-97cf-a9759218eba7` | inactive/closed |

The records were confirmed on November 3, 2026. Reconfirm all identity and count assertions immediately before any later operation; these values are not a standing authorization.

## Read-only dependency inventory (November 3, 2026)

| Fixture | Case assignments | Status history | Sessions | Meetings | Material snapshots | Homework assignments / revisions / progress / answers / audit | Assessment schedules / participant assignments / attempts / responses / scores | Deliveries / webhook events / realtime signals | Generic Case audit events |
|---|---:|---:|---:|---:|---:|---|---|---|---:|
| Realtime Meetings Test | 1 | 1 | 0 | 1 | 0 | 0 / 0 / 0 / 0 / 0 | 1 / 0 / 0 / 0 / 0 | 8 / included in total below / 1 | 1 |
| Realtime Case Closure Test | 1 | 1 | 0 | 0 | 0 | 0 / 0 / 0 / 0 / 0 | 1 / 0 / 0 / 0 / 0 | 0 / included in total below / 0 | 1 |
| C2 Final Realtime Verification | 1 | 1 | 0 | 1 | 0 | 0 / 0 / 0 / 0 / 0 | 1 / 0 / 0 / 0 / 0 | 0 / included in total below / 0 | 1 |
| Selective Session Content Test | 1 | 3 | 1 | 2 | 1 | 1 / 1 / 2 / 0 / 0 | 1 / 0 / 0 / 0 / 0 | 6 / included in total below / 1 | 1 |
| Final Resource Pinning Test | 1 | 3 | 1 | 2 | 2 | 1 / 1 / 2 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / included in total below / 0 | 1 |
| **Total** | **5** | **9** | **2** | **6** | **3** | **2 / 2 / 4 / 0 / 0** | **4 / 0 / 0 / 0 / 0** | **14 / 16 / 2** | **5** |

Additional verified dependencies and shared-data guards:

- All five have one active `assignment_type = counselor` assignment. Four point to shared Counselor team `6a824c7b-7ffc-43c5-a35e-45f242c0ff16`; Realtime Meetings Test points to shared Counselor team `629ce9aa-e704-490f-ad76-338e94884a00`. Preserve both teams and all their unrelated assignments/history.
- All five Cases have one `audit_events` record (`event_type = case.assigned`, `entity_type = counseling_case`; IDs 1674, 1676, 1677, 1679, 1680). `audit_events.entity_id` is polymorphic and has no FK to Cases. The five audit entries can remain without an FK violation, but will refer to removed Case IDs and will no longer resolve to Case rows. The Admin audit policy is SELECT/INSERT only; no UPDATE/DELETE policy or audit-table trigger appeared in the live catalog. Keep these records; their intended orphan-reference semantics still require product/data-owner acceptance.
- The shared Resource version `86ef8d8c-74a2-48f8-9e82-761ab9f92aca` has three snapshot references overall; only one belongs to the candidate Cases. Preserve the version, parent Resource, underlying Storage object, and the two non-candidate references. Candidate profile-photo paths and UUID-matched Storage object paths: zero. Do not infer that this means other unrelated Storage content is disposable.
- There are zero candidate-linked `assessment_documents`, participant assignments, attempts, responses, scores, or in-app notifications. Four Case schedules exist and must be removed before their Cases due `ON DELETE RESTRICT`.
- The six meeting rows include two Final Resource Pinning records whose starts are in the future (Dec 26 and 27, 2026 UTC), but both already have `completed_at` set. They are not open/future reminder candidates as presently represented. They are still fixture-owned meeting rows; reconfirm their exact status immediately before cleanup. Fourteen delivery rows have 16 webhook events total; delivery deletion cascades to webhook events. Two meeting update-signal rows exist; Case deletion cascades to those signals.
- Group-bound intake requests, invitations, Campus Lead/Coach assignments, Campus Lead/Counselor assignments, and supervision assignments: zero. Each profile has exactly one membership (the target Couple), one role row, and no profile photo handoff. The four Homework progress rows are the only candidate-person references found in the sampled participant tables; they must be removed with their fixture-owned Homework data before Auth deletion.
- The ten Auth users have ten `auth.identities`, four Auth sessions, and 145 refresh-token rows. These are Auth-owned dependent rows removed by Auth user deletion; they are not independently transactionally deletable as part of a Postgres transaction.
- Prior source search on this branch found no supported setup/verifier runtime selectors for the five IDs. These literals remain in the static regression contract test and historical `PROJECT_STATE.md` records. The existing realtime setup scripts are persistent fixture creators and are not self-cleaning; do not run them as part of cleanup or assume they recreate these exact fixtures.

## Deletion protections, FK/RLS findings, and current blockers

- Existing `public.delete_disposable_team_graph(uuid)` in migration `20260915110000_report_team_delete_blockers.sql` is `SECURITY DEFINER`, uses empty `search_path`, is executable only by `service_role`, and explicitly raises `team_delete_blocker:counseling_case_history` when any Case references a group. It also protects assignments, supervision, organizational links, external memberships, invitation history, and ministry history. **Do not weaken, bypass, or call it expecting these Cases to delete.** `delete_disposable_intake_graph` has equivalent Case/assignment-history protections and is for a distinct intake-owned graph.
- There is no reviewed Case/Couple permanent-delete RPC. The live FKs use `ON DELETE RESTRICT` for Case assignments, status history, Case Sessions/Meetings, material snapshots, homework assignments/revisions/audit, assessment scheduling/participants, and several Case/profile actors. Group-to-Case, invitation, intake, organizational, and team-history FKs also restrict deletion. Group memberships cascade from a group; profiles cascade from Auth users. Meeting notification deliveries cascade from Cases and webhook events cascade from deliveries. These constraints require an explicitly designed, exact-allowlist transaction and fresh dependency assertions; they are not permission to disable constraints or triggers.
- RLS is not a cleanup contract. Live policies show Admin-only `ALL` on Cases, Admin-only SELECT/INSERT on generic audit events, SELECT-only on several history tables, and no ordinary authenticated delete policy for the associated graph. Any eventual controlled deletion must use a separately reviewed privileged path, with exact DEV assertion and explicit authorization—not broadening user grants or adding a generic destructive RPC.
- Current counts include five assignments, nine status-history rows, two Sessions, six Meetings, three pinned material snapshots, two Homework assignments/revisions, four participant-progress rows, four Assessment schedules, fourteen notification deliveries, sixteen webhook events, two realtime signals, and five generic Case audit rows. Leaving any restrictive child reference will abort Case deletion. Homework audit has a pre-write validation trigger and restrictive parent FK; its current count is zero, but any new row at execution time is a STOP condition.
- No Candidate Auth ID is currently used as an inviter, Case creator/assignment actor, Assessment actor/participant, or generic audit actor. Fourteen `notification_deliveries.recipient_profile_id` references point to candidate members; all 14 are the candidate Case deliveries and Case deletion cascades to the delivery rows (webhook rows also cascade from deliveries). Before deleting Auth identities, the DB cleanup must remove each profile's target Couple membership/group and participant-owned Homework progress, and recheck every restrictive profile FK. Auth deletion cascades the profile and its remaining role/membership/profile-owned rows. Do not delete profiles directly or assume Auth Admin removal is rolled back when SQL rolls back.

## Conditional execution sequence (not approved or executed)

1. Obtain separate explicit execution approval and satisfy the backup/recovery gate above. Freeze fixture use and stop scheduled verifier/setup activity. Record a timestamped, encrypted, access-controlled preflight export of exact allowlisted row identities/counts and relevant storage metadata; it is an audit manifest, not a substitute for a full recoverable backup.
2. Reconfirm project URL/ref and linked target from a trusted operator session. Abort on any mismatch. Run only read-only preflight queries first: all five group/Case pairs, ten exact Auth/profile IDs, current statuses/memberships, all dependency counts above, shared Counselor team and Resource-version reference counts, user references, future meeting completion state, generic audit IDs, and migration/schema guard state. Require exact expected counts or STOP and re-plan.
3. In one explicit, reviewed Postgres transaction, lock exact Case/group rows and assert the literal allowlist plus expected counts. Remove only fixture-owned restrictive children in dependency order (Assessment Case schedules/overrides/participants if any; notifications/signals and delivery/webhook children as required; meeting rows; material snapshots; Homework answers/progress/revisions/assignments and any other exact Case-owned rows; status history and Case assignments; Case Sessions; then Cases; Couple group memberships; then the Couple groups). Keep generic `audit_events` rows 1674/1676/1677/1679/1680. Never delete shared Resource rows/version/storage, shared Counselor teams, or any row outside the explicit manifest. Existing cascade relationships may remove delivery/webhook/signal children; assert the expected cascade counts inside the transaction. Do not disable triggers, RLS, or FK constraints.
4. Before committing that DB transaction, verify all five Cases/groups and their enumerated fixture children are absent, generic audit entries remain byte-for-byte (same IDs and entity IDs), shared Resource/team references are unchanged, and unrelated control counts are unchanged. Any mismatch: ROLLBACK the entire DB transaction and stop. After commit, SQL rollback is no longer available.
5. Only after successful DB commit, delete the ten Auth users one at a time through the approved Auth Admin API, using the exact allowlist and checking each response by ID without logging credentials. This is a separate, non-atomic step. On first failure, stop immediately—do not retry broadly or recreate accounts. The committed DB graph and remaining Auth users will be partially cleaned. Restore from the pre-verified whole-project recovery point under the approved incident plan; the normal Auth API cannot guarantee recreation of the original UUIDs/password state. Do not proceed if this cross-system partial-failure risk is not accepted.
6. Post-verify exact absent IDs/zero dependent rows, ten absent Auth users/profiles/identities, no candidate storage objects, retained generic audit rows, unchanged shared teams/Resource/version and unrelated control fixtures, and no reminders for candidate meetings. Review application login, Coach/Counselor/Couple workspaces, Assessment, Homework, notifications, Resources, and Auth admin behavior. Keep encrypted preflight manifest and recovery-point details per data-retention policy.

The order above is only a candidate plan. The live FK inventory and future state may require adjustment; a database owner must author and review the actual transaction before execution. No executable DELETE SQL is included here.

## Read-only verification templates

These examples are SELECT-only and intentionally limited to the approved IDs. They are not an execution script. Re-run with `supabase db query --linked --project-ref lctkqjjkhpyootwvttvj`; verify the output project ref separately before every query.

```sql
with allowlist(group_id, case_id) as (values
  ('9554f01a-d22f-409b-9255-2108c0f9e1a5'::uuid,'95eac800-d449-4d06-9555-cf13c7a178c7'::uuid),
  ('172fbabd-1d5a-40dd-bd86-97e318f7b97d','1bc549ee-5c8e-4037-84d6-bdc3c295837b'),
  ('6b824020-fd60-40e3-ac83-eb3ddc8812c1','ef59520b-6e29-40c1-877a-6773e2c6e58e'),
  ('ae442afe-3e34-43f4-8060-422c489988ce','37431ff7-a887-4953-9e00-a276fe78817c'),
  ('639b63c0-832b-445c-bc50-dd0f1a95d832','9f85cf1c-8bae-491e-a18b-4ef315b04871')
)
select a.group_id, g.id as existing_group_id, g.group_type, g.active,
       a.case_id, c.id as existing_case_id, c.couple_group_id, c.status
from allowlist a
left join public.groups g on g.id = a.group_id
left join public.counseling_cases c on c.id = a.case_id
order by a.case_id;

select id, entity_type, entity_id, event_type
from public.audit_events
where id in (1674, 1676, 1677, 1679, 1680)
order by id;
```

Post-cleanup verification must use the same exact `allowlist` CTE and confirm all five `existing_group_id`/`existing_case_id` values are NULL, the five audit rows above remain unchanged, the ten explicit profile/Auth IDs have no rows, and all shared-data/control assertions still match the approved preflight manifest. Never substitute a whole-table count or a broad name match for the exact-ID checks.

## Explicit STOP conditions

- DEV ref cannot be conclusively verified; a query is not explicitly targeted at DEV; or a record ID/name/status/membership differs from this manifest.
- No independently verified full-project database/Auth recovery point, Auth-ID continuity strategy, or required Storage recovery is available.
- Any dependency count changes, a new Homework audit event appears, a candidate user has any new role/group/workflow reference, any shared team/resource reference differs, or any reminder-eligible Meeting exists.
- Generic audit preservation is rejected or audit semantics for dangling `entity_id` need product approval.
- A direct delete would require weakening `delete_disposable_team_graph`, audit controls, RLS, FK constraints, or triggers; or the proposed execution plan cannot keep the SQL graph deletion atomic.
- Auth Admin deletion is not explicitly authorized after the DB transaction, the first Auth deletion fails, or exact per-ID postconditions cannot be verified.
- Any unrelated record, active test fixture, published content, Auth role, Case assignment, team hierarchy, or storage object would be affected.

## Decision

**Cleanup is BLOCKED, not READY.** The live inventory is specific enough to plan the graph removal, and the current five generic Case audit rows can be retained structurally. But available backup/recovery evidence is insufficient for a destructive operation spanning a committed database transaction and ten non-transactional Auth Admin deletions. Next step: a project owner must verify/enable an appropriate DEV recovery capability and validate Auth identity recovery; then review this runbook and separately approve a narrowly scripted exact-ID execution plan. No cleanup has been run.
