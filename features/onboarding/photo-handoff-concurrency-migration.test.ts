import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20261113100000_secure_photo_handoff_uploads.sql", import.meta.url), "utf8");

describe("photo handoff upload concurrency migration", () => {
  it("claims and publishes only a unique object for the current attempt", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("upload_attempt_id is distinct from target_attempt_id");
    expect(migration).toContain("upload_previous_photo_path");
    expect(migration).toContain("profiles/' || target_profile_id::text || '/handoffs/' || target_attempt_id::text || '.avif'");
    expect(migration).toContain("set photo_path = expected_path where id = target_profile_id");
    expect(migration).toContain("drop policy if exists profile_photo_owner_select on storage.objects");
    expect(migration).toContain("auth.uid()::text || '/handoffs/");
  });

  it("keeps claim, finalize, and release RPCs service-role-only", () => {
    for (const rpc of ["claim_profile_photo_handoff_upload", "finalize_profile_photo_handoff_upload", "release_profile_photo_handoff_upload"]) {
      expect(migration).toContain(`revoke execute on function public.${rpc}`);
      expect(migration).toContain(`grant execute on function public.${rpc}`);
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]* to service_role`));
    }
    expect(migration).toContain("revoke execute on function public.complete_profile_photo_handoff(text) from public, anon, authenticated, service_role");
  });

  it("preserves ten-minute and replacement invalidation behavior", () => {
    expect(migration).toContain("now() + interval '10 minutes'");
    expect(migration).toContain("set completed_at = now()\n  where profile_id = actor and completed_at is null");
    expect(migration).toContain("handoff.expires_at <= now()");
  });
});
