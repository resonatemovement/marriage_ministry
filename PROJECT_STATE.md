Project State Document — Resonate Marriage Ministry
Last updated: September 28, 2026
Current working branch: feature/homework-preview
Repository: resonatemovement/marriage_ministry
Current base: merged main at 81e177780c9adb35a0f523e84a9b62e5ed7273d4
Current state: Preview milestone is approved and committed locally on `feature/homework-preview`; push/merge closeout is blocked pending resolution of an automatic approval rejection for external repository data egress. Homework Builder milestone is already merged to main.
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
The current development focus is the Session Builder / Homework authoring system.
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
- Currently includes Video / Link.
- Resources are displayed separately from Pages.
- Future resources may include PDFs, worksheets, downloads, etc., but none of those are implemented yet.
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
Current branch:
feature/homework-preview
Preview is committed locally; feature push and merge are not complete.
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
Current branch
feature/homework-preview
Base is merged main at 81e177780c9adb35a0f523e84a9b62e5ed7273d4. Preview commit `64dec0314e78988f420ca957eb2bac064fb83a9d` is local. Its push was rejected by automatic approval review as external repository data egress; Preview is not pushed or merged. Preserve this commit and do not reset or discard it.
Preview work included in the local milestone commit
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
Exact current Git diff should be inspected before milestone closeout rather than assuming this list is exhaustive.
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
Current Git state after local Preview commit: branch `feature/homework-preview`; `64dec0314e78988f420ca957eb2bac064fb83a9d` committed the approved Preview work and `AGENTS.md`/`PROJECT_STATE.md` workflow updates. Feature push was rejected by automatic approval review as external repository data egress. No merge or deploy occurred.
Focused validation for the Video / Link refinement before the final gate:
- Node v24.21.0; 7 tests passed across 2 files.
- `npm run typecheck`, `npm run lint`, and `git diff --check` passed.
Browser/manual review status (user-reported complete and approved):
- Session-level Preview behavior, Session Material Page title/body alignment, and Page-by-Page Preview were reviewed and approved.
- RichTextEditor bounded internal scrolling and persistent toolbar visibility were reviewed and approved.
- Shared Video / Link Preview was reviewed and approved in Session Material Resources and Homework; no redundant raw URL is shown.
- The user reports the overall Preview behavior and responsive presentation look correct. The agent did not independently perform the browser review.
Next exact steps:
1. Audit the complete Git status and diff and confirm every change belongs to the approved Preview milestone or the approved AGENTS.md/PROJECT_STATE.md workflow updates.
2. Obtain approval for the exact push of `64dec0314e78988f420ca957eb2bac064fb83a9d` to `origin/feature/homework-preview`; automatic approval review rejected it as external repository data egress and instructed against retrying or using another route.
3. After that push succeeds, safely update local `main` from origin, merge Preview with a merge commit, push `main`, and confirm the remote merge.
4. Only after confirming pushed `main`, delete `feature/homework-preview` locally/remotely and create `feature/resource-library` from updated `main`.
5. Update, commit, and push the final `PROJECT_STATE.md` transition on `feature/resource-library`; leave the working tree clean.
Preview milestone closeout
After full validation:
1. Audit entire git status and diff.
2. Confirm all files belong to Preview milestone.
3. Confirm no temporary/debug/secrets.
4. Commit Preview branch.
5. Push Preview branch.
6. Merge to main.
7. Push main.
8. Delete completed Preview branch.
9. Create next feature branch only after deciding next milestone.
Do not deploy unless explicitly approved.
PROD remains untouched.
Likely future milestones
These are known future directions but should not be started until the current Preview milestone is closed.
Approved next milestone: Resource Library
Product direction:
- Build a standalone application-level Resource Library, not owned by Session Material; other features may reference its resources later.
- Use WordPress Media Library as the general mental model.
- Make it a top-level feature for `super_admin`, `admin`, and `author`.
V1 permissions:
- Super Admin/Admin: upload, browse, edit metadata, archive, delete unused resources, and replace files.
- Author: upload, browse, select, edit metadata, and replace files they are permitted to edit.
- Archive and permanent-delete authority remains Admin/Super Admin.
Initial file categories:
- Images, PDF/documents, Word documents, audio, and video.
Architecture direction:
- Store binaries in Supabase Storage and metadata/identity in Postgres.
- Consumers reference stable `resource_id` values, never copied raw Storage URLs as identity.
- External Video / Link remains distinct from uploaded managed Resources.
Replacement/versioning:
- Replace File preserves the same stable `resource_id` and creates a new file version; current metadata and relationships stay attached to the Resource.
- Current use may resolve to the latest active version; future immutable/historical assignments may pin a resource version.
- Retain the current version and up to 3 previous versions. Protect versions referenced by historical/immutable records from automatic pruning; older unreferenced versions may be cleaned up.
- Represent the retention count as configurable server-side policy, not scattered constants.
Deletion:
- Never hard-delete a referenced Resource; archive it.
- Unused Resources may support destructive DELETE confirmation under the established app standard.
No Resource Library implementation has started. Exact next step: design the foundation across the DB model, Storage layout, RLS/permissions, upload validation, replacement/version retention, and archive/delete integrity before implementation.
Selective Page assignment
Counselor can choose specific Session Pages for each couple.
Important:
- reference stable Page identities;
- do not use visual index as identity;
- allow different couples to receive different Page selections.
Resource-selection behavior remains to be designed.
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
10. Pages are Session Material rich_text; Resources currently map to video_link. Do not rename DB values just for UI terminology.
11. Homework Rich Text remains called Rich Text. Session Material Rich Text is called Page.
12. Preview uses current staged content and performs no persistence.
13. Future Page assignment must use stable Page identity.
14. Preserve shared authoring/rendering components rather than creating parallel copies.
15. Do not merge state models merely because their code looks similar.
16. Use focused validation during development; full suite only at milestone gates.
17. Use Node 24 for milestone validation.
18. Current branch is feature/homework-preview and contains local Preview commit `64dec0314e78988f420ca957eb2bac064fb83a9d`, which must be preserved.
19. Update PROJECT_STATE.md before considering every coding-agent task complete, including validation and Git milestones.
20. Record browser/manual verification only when actually performed.
21. Do not commit/push/merge Preview until the full milestone regression gate and browser review are complete and the user approves Git closeout. The current Preview commit is approved; its external push remains blocked by automatic approval review.
