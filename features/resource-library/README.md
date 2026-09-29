# Resource Library foundation

Standalone application-level managed uploads; no UI, Session Material, Homework,
Preview, or other consumer integrations. External Video / Link stays independent.

## Model and boundaries

`resources.id` is stable identity. `resource_versions.id` is an immutable binary
identity. Original creator ownership never changes on replacement. A composite FK
from `(resources.id, current_version_id)` to `(resource_versions.resource_id, id)`
prevents cross-resource current pointers. Finalization locks the Resource and
increments its persistent `last_version_number`; pruning cannot reset numbering.
No authenticated table writes are granted. Version UPDATE is rejected even for
privileged connections. Future restoration of old content must produce a NEW
version; there is no rewind operation.

Pending `resource_uploads` hold reserved identities/declared file metadata, not
tokens. Initial Resources have no current version and are hidden by RLS until
finalization. The private `resource-library` bucket uses
`{resource_id}/{version_id}/{sanitized-original-filename}`. Original images and
original filename metadata are preserved, with no conversion/thumbnails.

`policy.ts` is the centralized application contract: image 15 MiB, document
25 MiB, audio 75 MiB, video 250 MiB; current plus 3 previous versions; 5-minute
signed access. MIME allowlists include JPEG/PNG/WebP/AVIF, PDF/DOC/DOCX,
MP3/M4A/AAC/WAV, MP4/WebM (including common WAV/M4A MIME aliases).
The schema migration has one database validation snapshot and bucket MIME/overall
limit enforcement; the policy contract test checks alignment. Future policy
changes require a migration, not editing applied migration files.

Active-profile Admin/Super Admin manage all. Authors browse active resources,
upload, edit/replace only their own active resources. Authors cannot archive,
restore, or permanently delete. Existing role helpers and Supabase server/env
patterns are reused; workspace selection has no authorization effect. SQL RPCs
recheck permissions and lock mutations; definer functions have an empty search
path and explicit execute grants. Audit events reuse `public.audit_events`.

## Server/UI boundary

The `server.ts` exports remain server-only operations, not public routes or
Server Actions. `features/resource-library/actions.ts` wraps metadata and
identity operations as authenticated Server Actions. Binary bodies never pass
through Next.js; the browser uploads directly to Supabase Storage:

1. `prepareUpload`: validate MIME/category/size/ownership; reserve exact Resource
   and Version UUIDs through authenticated RPC; issue a service-authorized
   exact-path signed upload token with `upsert: false`.
2. Browser uploads the original binary directly to Supabase with the returned
   path/token and declared content type. Standard `uploadToSignedUrl` needs no
   new package. There is deliberately no general authenticated Storage INSERT,
   UPDATE, or DELETE policy.
3. `finalizeUpload`: reauthorize; require the actual Storage object metadata
   size/MIME to match the reservation; insert an immutable version and advance
   current in one DB transaction. Failed replacements keep the previous current.
4. Return the version plus explicit maintenance status. Cleanup failures must be
   surfaced/retryable, not reported as replacement failures.

Other server exports: `browseResources`, `getResourceDetail`, `editResourceMetadata`,
`signedResourceAccess` (view/download, optionally a specific version),
`archiveResource(id, boolean)` (archive/restore), `cancelUpload`,
`permanentlyDeleteResource(id, "DELETE")`, and admin `retryResourceCleanup`.
Browsing is deterministic/paginated and supports title search/category/archive.
Signed reads use the authenticated RLS client, never privileged signing to bypass
visibility. Bearer signed access remains usable until expiry, even after archive.

The standalone `/resource-library` UI is implemented. Admin, Super Admin, and
Author navigation and route access are role-scoped; Authors only receive active
resources and management controls for their own active Resources. The page is
grid-first with local title/description/current-filename search and category
filters over the currently loaded result set. Admins can switch between active
and archived views. Image cards and detail previews use short-lived signed URLs;
audio/video use native controls, while documents use a restrained file card and
Open/Download actions. Upload/replacement uses MIME-derived categories and the
centralized policy, with preparation/upload/finalization stages rather than
invented byte percentages. Replace keeps the same Resource identity. Archive,
restore, metadata edit, and exact-uppercase `DELETE` call the existing
server-side operations; RLS/RPC authorization remains authoritative.

## Cleanup and historical protection

Successful finalization invokes service-only pruning with the centralized
retention count. DB deletion happens first and writes an outbox entry in the same
transaction. Only committed outbox paths may be removed from Storage. Failures
keep the outbox row, attempt count, and last error; success acknowledges it after
Storage removal. A bounded admin retry expires abandoned intents and drains
eligible outbox paths. No scheduler is added; failed/abandoned uploads require
explicit maintenance until a later scheduling decision.

Cancellation locks Resource then intent and never queues finalized versions,
including when a finalization committed but its response was lost. Signing is
restricted to the first minute of a 3-hour reservation. Cancelled/expired intent
paths are queued no earlier than reservation expiry to avoid deleting an object
while its upload token can recreate it. [Signed upload tokens expire after two
hours](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl).
Do not add resumable uploads without revisiting cleanup timing: [TUS upload URLs
can live for 24 hours](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).

There is NO generic usage table and no production consumer relationship yet.
Before the FIRST version-pinning consumer, add that domain's explicit RESTRICT
FK(s), extend the pruning candidate/reference checks, and regression-test archive,
access, prune, and delete. The SQL prune function already skips FK-protected
candidates; the DB remains the final safety boundary. Permanent deletion queues
no files if any Resource/Version consumer FK rejects the transaction. Historical
application records must NEVER cascade away. Archive preserves all records and
binaries; eligible unused permanent deletion requires Admin/Super Admin.

## Verification and deferred risks

`resource-library-dev-verification.sql` is rollback-only and creates only
transactional synthetic Storage metadata, not real remote binaries. Its temporary
consumer table also rolls back. Focused Vitest tests cover policy, authorization,
orchestration, mocked server data access, UI presentation, role navigation, and
direct-upload sequencing. Manual browser verification of the new UI has not yet
been performed.

The bucket maximum is 250 MiB. The project's [global upload limit](https://supabase.com/docs/guides/storage/uploads/file-limits)
may impose a lower ceiling and must be checked before large-file UI verification;
this milestone does not change project-wide configuration. No real 75/250 MiB
browser upload, signature/virus scanning, or resumable transport was tested or
implemented. MIME/size checking uses Storage's upload metadata, not binary magic
byte inspection; MIME is the primary contract, never filename-only acceptance.
Short-lived tokens must not be logged or persisted. The upload UI disables
closure and duplicate submissions during transfer and reports cleanup warnings
separately from successful file finalization.

Exact next task: **USER BROWSER REVIEW OF RESOURCE LIBRARY UI**, followed by
approved refinements and the full milestone regression gate. Practical small-file
browser upload checks should use Marriage Ministry DEV only; inspect the project
global Storage limit before large-file testing. Session Material consumers,
historical/pinned consumers, advanced thumbnails, and resumable uploads remain
deferred.
