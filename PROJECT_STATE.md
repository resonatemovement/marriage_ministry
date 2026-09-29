Project State Document — Resonate Marriage Ministry
Last updated: September 29, 2026
Current working branch: feature/resource-library
Repository: resonatemovement/marriage_ministry
Current base: Preview merge on main at a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2; resource milestone documentation commit 1afe047db125e292ae48bd023b6142abe97b666b
Current state: Session + Homework Preview is complete, browser-reviewed and approved, and merged on tracked main. Resource Library foundation is implemented and applied to Marriage Ministry DEV, with uncommitted review changes on feature/resource-library. No Resource Library UI or consumer integrations exist yet.
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
The current development focus is the standalone Resource Library; the approved Session Builder / Homework authoring and Preview behavior remains unchanged.
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
feature/resource-library
Created from updated `main` at `a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2`. Current branch HEAD/upstream `origin/feature/resource-library` are at `1afe047db125e292ae48bd023b6142abe97b666b` (`docs: start resource library milestone`). Main matches its local origin tracking ref. The foundation is uncommitted: PROJECT_STATE.md, the exported existing admin-role helper, regenerated database types, the new Resource Library feature directory, and two migrations. No Git mutation/commit/push/merge/branch deletion occurred in the foundation task.
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
Next exact development step: Resource Library standalone UI (see the implemented foundation and deferred risks below).
Preview milestone closeout (completed locally)
Final regression and diff checks passed; browser/manual review was user-approved.
Preview and its follow-up state commit are on the remote Preview feature branch.
Preview is merged to `main`; local `origin/main` now matches merge commit `a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2`. The local Preview branch was deleted after confirming reachability; its remote-tracking ref is now absent. These tracking observations do not claim a new fetch or agent push/deletion.
No deployment occurred; PROD remains untouched.
Current milestone: Resource Library foundation validated and ready for commit on `feature/resource-library`.
No deployment is authorized. Do not push, merge, deploy, or touch PROD as part of this milestone closeout.
Approved next milestone: Resource Library standalone UI
Product direction:
- Standalone application-level Resource Library, conceptually analogous to a WordPress Media Library.
- Not owned by Session Material. Uploaded Resources may later be referenced from Session Material and other application features.
- Consumers reference stable Resource identity; do not duplicate files or use raw Storage URLs as identity.
- Top-level feature available to Super Admin, Admin, and Author.
V1 permissions:
- Super Admin/Admin: upload, browse, edit metadata, replace files, archive, and permanently delete eligible unused Resources.
- Author: upload, browse active resources, select in future consumers, edit metadata and replace only Resources originally created by that Author. Archived resources are unavailable to Authors.
- Archive, restore, and permanent-delete authority remains Super Admin/Admin. Admin replacement never transfers original ownership. Active workspace grants no permission.
Initial file categories:
- Images, PDFs, document files including Word documents, audio, and video. Establish file-type foundations without implementing file-type-specific UI.
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
- `server.ts` provides prepare/finalize/cancel, browse/detail, metadata edit, signed view/download, archive/restore, uppercase DELETE eligible permanent delete, and explicit admin cleanup retry. These are server-only operations, not routes/actions/UI yet.
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
Session Material integration is deferred until after the standalone Library exists. Later Resource actions may include `Choose from Resource Library` and `Add External Link`; do not integrate it during the foundation milestone.
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
- The foundation is validated and ready for commit with `feat: add resource library foundation`. No push, merge, or deploy is part of this closeout.
- Browser/manual upload verification is not performed: there is no Library UI. Project-wide Storage limit is not verified or changed and could cap the bucket's 75/250 MiB allowances; verify it before large-file UI tests. MIME checks validate upload metadata, not file-signature/virus scanning. Real direct browser uploads and resumable transport remain unverified/deferred.
- Resource implementation/details and future safety constraints documented in `features/resource-library/README.md`. No Session Material, Homework, Video/Link, or Preview changes/integration; no PROD access/mutations, deploy, commit, push, merge, or branch deletion.
- Completion speech attempted with `say "Resonate Resource Library foundation is ready for review"`; the command returned 0 but emitted `sandbox_extension_issue_file failed for /usr/bin: 1 (Operation not permitted)`. Audible delivery is unconfirmed due to the sandbox error.
Exact next milestone: RESOURCE LIBRARY STANDALONE UI — top-level Resource Library navigation; grid-first library page; search and category filters; Upload Resource flow with direct browser-to-Supabase Storage upload and progress/error states; Resource detail Sheet; metadata editing; View/Open/Download; Replace File UX; Admin archive/restore; Admin permanent delete with exact `DELETE` confirmation; permission-aware Author behavior. Wrap server-only metadata operations in authenticated actions and transfer binaries directly to Supabase Storage. No UI is implemented yet.

Deferred Resource Library validation and design:
- Real browser upload validation and practical large-file browser testing belong to the standalone UI milestone. Consider resumable uploads only if later needed.
- Session Material integration remains deferred until after the standalone Library exists; no Resource Library integration with Session Material, Homework, or Preview has been implemented.
- Before adding future pinned or historical consumers, add explicit restrictive foreign keys/reference protection and extend pruning/reference tests.
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
18. Current branch is `feature/resource-library`; Preview merge `a3be0347cc82f2874eb2f2a68898e70ecf0f6cc2` is on local `main`.
19. Update PROJECT_STATE.md before considering every coding-agent task complete, including validation and Git milestones.
20. Record browser/manual verification only when actually performed.
21. Preview is regression-validated, browser/manual reviewed and approved, and merged; current local tracking refs show main at that merge. Resource Library foundation is uncommitted on feature/resource-library; next is Resource Library standalone UI, not Session/Homework integration.
