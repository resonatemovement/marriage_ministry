# Agent Working Guide

## Project Principles

- Follow DRY, YAGNI, and KISS. Prefer simple, maintainable solutions and short, focused functions.
- Reuse existing components, utilities, hooks, types, validation, data access, and domain logic when reuse is real.
- Avoid duplication, speculative abstractions, dead files, unused exports, and unused dependencies.

## Architecture

- This is a strict TypeScript Next.js App Router application. Prefer Server Components and server-side data access; minimize client components and client JavaScript.
- Keep business and domain logic outside presentation components. Keep code feature-local until genuine reuse justifies promotion to shared modules.
- Role, status, and workspace concepts are centralized. Inspect existing code before creating parallel implementations.

## UI Conventions

- Use existing shadcn primitives for standardized controls. Do not introduce native `<select>` controls where shadcn Select exists.
- Preserve the current Resonate visual system and avoid unrelated redesign during functional work.
- Button/action controls should avoid decorative outlines or rings; keyboard focus must remain visible through a non-outline state. This does not broadly change form-field focus styling.
- Accessible labels, focus states, keyboard behavior, and field-level error states are required.
- Numeric fields must follow project-wide numeric input conventions when introduced. Use AVIF by default for application image assets unless compatibility requires another format.

## Auth, Roles, and Workspaces

- Roles are independent and profiles may have multiple roles: `super_admin`, `admin`, `campus_lead`, `coach`, `counselor`, `couple`, and `author`.
- Campus Lead authority is explicitly campus-scoped; it never implies Coach authority.
- Campus Lead-to-Couple ownership targets the Campus Lead operational team, never an individual profile or a Coach/Counselor team.
- Super Admin is elevated capability, not a separate operational workspace. Explicit Admin remains Admin-first.
- Do not casually change multi-role workspace behavior. Active workspace is UX state only and never grants permission.
- Server authorization and Supabase RLS remain authoritative.

## Group and Team Invariants

- A Couple, Coach team, Counselor team, and Campus Lead team each represent exactly two individual users; each person has a separate Auth identity, profile, invitation, and login.
- A person must not belong to multiple active groups of the same operational type.
- Both Campus Lead team members have the `campus_lead` role, share one distinct Campus Lead team, and receive the same applicable campus scope. A Campus Lead team is distinct from Coach and Counselor teams.
- Group display names derive from member names and are not the permanent identity source of truth.
- Assignment and supervision history must be preserved.
- Operational roles remain distinct from Couple care assignments. A Couple has one active Counselor-of-record (`case_assignments.assignment_type = counselor`), fulfilled by an eligible Counselor, Coach, or Campus Lead team without changing that team's operational role.
- Reassigning the Counselor-of-record ends the previous active assignment and preserves history. Future operational-role changes must not rewrite historical Couple-care records.

## Invitation Rules

- Application-level invitation records are authoritative; Supabase Auth provides delivery and authentication only.
- Each invitation represents one individual. Grouped Couple, Coach, and Counselor invites create two individual invitations tied to one group.
- Valid statuses are `pending`, `accepted`, `expired`, and `revoked`; resend is an event, not a status.
- Only Admin and Super Admin may create invitations. Only Super Admin may invite another Super Admin.
- Grouped invites require two separate users. Campus must come from the active managed lookup.
- Delivery never implies acceptance. Partial delivery must be represented honestly.

## Supabase and Security

- RLS is authoritative. Do not weaken RLS to make a UI or verification pass, and keep `anon` access minimal.
- Service-role/secret credentials are server-only and must never reach browser code. Prefer narrow `SECURITY DEFINER` helpers or RPCs over broad grants where needed.
- Never store Auth invite tokens, magic-link tokens, secrets, or credentials in application tables. Preserve the existing audit-event system.
- Treat schema, grants, RLS, and destructive changes as narrow, reviewable work. DEV and PROD are separate; do not touch PROD unless explicitly instructed.

## Generated Types

- Never hand-edit generated Supabase types. Regenerate when tooling and permissions allow.
- If generation is blocked, isolate the narrowest safe typed boundary and do not use `any` as a workaround.

## Testing and Validation

- Add focused regression tests for changed behavior. Normal checks are TypeScript, ESLint, Vitest, and `git diff --check`.
- Run Knip and the production build when relevant. Run Supabase/DEV verification scripts when backend behavior changes, and perform browser/manual verification when tooling is available.
- Automated verifiers that create temporary persisted records must track and clean their own records; temporary verifier fixtures must not remain visible in normal DEV data. Persistent `DEV Test` fixtures are separate and must never be deleted.
- Do not install heavy testing or browser tooling for a small task without explicit approval.

Current verification commands:

- `npm run verify:supabase`
- `npm run verify:test-users`
- `npm run verify:invitations`
- `npm run verify:invitation-delivery`
- `npm run verify:supervision`

## Git and Task Discipline

- Stay on the branch specified by the task. Do not create, merge, delete, commit, push, deploy, or touch PROD unless explicitly asked.
- Keep each task narrowly scoped. Do not make extra UX or product decisions beyond the approved request.
- If configuration, permissions, or external state blocks safe progress, stop and report the blocker instead of guessing.

## Handoff Report

Every task returns `CHATGPT HANDOFF REPORT` with the current branch, files created and modified, behavior and decisions, migrations, validation/tests, browser or manual verification status, Git status and commit status, remaining concerns, and the exact recommended next task when requested.

## Audible Completion

- After successful implementation and validation, run the task-specific macOS `say` command when the prompt provides one.
- If speech fails with a known channel error such as `-915`, report it without treating implementation as failed. Never run success speech before validation is complete.

## Documentation Precedence

- `AGENTS.md` governs agent working conventions. Authoritative product and domain details remain in project docs, source code, and migrations.
- A task-specific explicit instruction wins over this guide. When unsure, inspect existing code and documentation before inventing behavior.
