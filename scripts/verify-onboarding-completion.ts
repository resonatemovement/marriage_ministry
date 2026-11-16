import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};
const client = (url: string, key: string) => createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const image = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 30, g: 80, b: 150 } } }).avif().toBuffer();

type Fixture = { id: string; email: string; password: string; user: ReturnType<typeof client>; paths: string[] };
type RpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };
type Readiness = { eligible: boolean; stateEligible: boolean; missing: string[] };

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function expectFailure(result: { error: { message: string } | null }, pattern: RegExp, label: string) {
  if (!result.error || !pattern.test(result.error.message)) throw new Error(`${label} was not rejected as expected.`);
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Onboarding completion verification refused: configured project is not approved DEV.");
  const service = client(url, required("SUPABASE_SECRET_KEY"));
  const { data: campus, error: campusError } = await service.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campusError, "Unable to read an active DEV campus");
  if (!campus) throw new Error("An active DEV campus is required.");
  const campusId = campus.id;

  const fixtures: Fixture[] = [];
  const prefix = `verify-onboard-completion-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Verify-${randomUUID()}!`;
  const admin = client(url, publishableKey);
  const superAdmin = client(url, publishableKey);
  const author = client(url, publishableKey);
  const couple = client(url, publishableKey);
  const campusLead = client(url, publishableKey);
  const coach = client(url, publishableKey);
  const counselor = client(url, publishableKey);

  async function signIn(target: ReturnType<typeof client>, emailName: string, passwordName: string) {
    const { error } = await target.auth.signInWithPassword({ email: required(emailName).toLowerCase(), password: required(passwordName) });
    fail(error, "Unable to authenticate a configured DEV verification user");
  }

  async function createFixture(label: string, values: Record<string, unknown> = {}): Promise<Fixture> {
    const email = `${prefix}-${label}@example.test`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    fail(error, "Unable to create isolated synthetic onboarding user");
    if (!data.user) throw new Error("Synthetic onboarding user was not created.");
    const fixture: Fixture = { id: data.user.id, email, password, user: client(url, publishableKey), paths: [] };
    fixtures.push(fixture);
    const { error: profileError } = await service.from("profiles").upsert({
      id: fixture.id,
      campus_id: campusId,
      first_name: "Synthetic",
      last_name: label,
      email,
      phone: "+14155550101",
      status: "onboarding",
      deactivated_at: null,
      ...values,
    }, { onConflict: "id" });
    fail(profileError, "Unable to prepare synthetic onboarding profile");
    const { error: signInError } = await fixture.user.auth.signInWithPassword({ email, password });
    fail(signInError, "Unable to authenticate synthetic onboarding user");
    return fixture;
  }

  async function setCanonicalPhoto(fixture: Fixture, extension: "webp" | "avif" = "avif") {
    const path = `profiles/${fixture.id}/avatar.${extension}`;
    const { error: uploadError } = await service.storage.from("profile-photos").upload(path, image, { contentType: "image/avif", upsert: true });
    fail(uploadError, "Unable to store synthetic canonical photo");
    fixture.paths.push(path);
    const { error: profileError } = await service.from("profiles").update({ photo_path: path }).eq("id", fixture.id);
    fail(profileError, "Unable to link synthetic canonical photo");
    return path;
  }

  async function setPublishedHandoffPhoto(fixture: Fixture) {
    const creator = fixture.user as unknown as RpcClient;
    const created = await creator.rpc("create_profile_photo_handoff", {});
    fail(created.error, "Unable to create synthetic secure handoff");
    const token = (created.data as { token?: string } | null)?.token;
    if (!token) throw new Error("Synthetic handoff token is missing.");
    const attempt = randomUUID();
    const claimed = await (service as unknown as RpcClient).rpc("claim_profile_photo_handoff_upload", { target_token_hash: hash(token), target_attempt_id: attempt });
    fail(claimed.error, "Unable to claim synthetic handoff photo");
    const path = (claimed.data as { object_path?: string } | null)?.object_path;
    if (!path) throw new Error("Synthetic handoff photo path is missing.");
    fixture.paths.push(path);
    const { error: uploadError } = await service.storage.from("profile-photos").upload(path, image, { contentType: "image/avif", upsert: false });
    fail(uploadError, "Unable to store synthetic handoff photo");
    const finalized = await (service as unknown as RpcClient).rpc("finalize_profile_photo_handoff_upload", { target_token_hash: hash(token), target_attempt_id: attempt });
    fail(finalized.error, "Unable to publish synthetic handoff photo");
    if (finalized.data !== true) throw new Error("Synthetic handoff photo was not published.");
    return path;
  }

  async function readiness(profileId: string): Promise<Readiness> {
    const result = await (admin as unknown as RpcClient).rpc("admin_get_onboarding_readiness", { target_profile_id: profileId });
    fail(result.error, "Admin readiness RPC failed");
    const value = result.data as Readiness | null;
    if (!value || typeof value.eligible !== "boolean" || typeof value.stateEligible !== "boolean" || !Array.isArray(value.missing)) throw new Error("Admin readiness response shape is invalid.");
    return value;
  }

  async function complete(target: ReturnType<typeof client>, profileId: string) {
    return (target as unknown as RpcClient).rpc("admin_complete_onboarding", { target_profile_id: profileId });
  }

  try {
    await signIn(admin, "TEST_ADMIN_EMAIL", "TEST_ADMIN_PASSWORD");
    await signIn(superAdmin, "TEST_SUPER_ADMIN_EMAIL", "TEST_SUPER_ADMIN_PASSWORD");
    await signIn(author, "TEST_AUTHOR_EMAIL", "TEST_AUTHOR_PASSWORD");
    await signIn(couple, "TEST_COUPLE_1_EMAIL", "TEST_COUPLE_1_PASSWORD");
    await signIn(campusLead, "TEST_CAMPUS_LEAD_EMAIL", "TEST_CAMPUS_LEAD_PASSWORD");
    await signIn(coach, "TEST_COACH_EMAIL", "TEST_COACH_PASSWORD");
    await signIn(counselor, "TEST_COUNSELOR_EMAIL", "TEST_COUNSELOR_PASSWORD");

    const userCanonical = await createFixture("user-canonical");
    const userCanonicalPath = `profiles/${userCanonical.id}/avatar.avif`;
    const { error: userUploadError } = await userCanonical.user.storage.from("profile-photos").upload(userCanonicalPath, image, { contentType: "image/avif", upsert: true });
    fail(userUploadError, "User canonical photo upload failed");
    userCanonical.paths.push(userCanonicalPath);
    const recordPhoto = await (userCanonical.user as unknown as RpcClient).rpc("record_onboarding_photo", {});
    fail(recordPhoto.error, "User canonical photo record failed");
    const userReady = await readiness(userCanonical.id);
    if (!userReady.eligible || !userReady.stateEligible || userReady.missing.length) throw new Error("Canonical-photo readiness disagrees with user completion eligibility.");
    fail((await (userCanonical.user as unknown as RpcClient).rpc("complete_onboarding", {})).error, "Canonical-photo user completion failed");

    const userHandoff = await createFixture("user-handoff");
    const userHandoffPath = await setPublishedHandoffPhoto(userHandoff);
    const userHandoffReady = await readiness(userHandoff.id);
    if (!userHandoffReady.eligible || !userHandoffReady.stateEligible) throw new Error("Published handoff photo was not considered eligible.");
    fail((await (userHandoff.user as unknown as RpcClient).rpc("complete_onboarding", {})).error, "Handoff-photo user completion failed");
    if (!userHandoffPath.includes("/handoffs/")) throw new Error("Synthetic handoff did not use its protected path.");

    const adminCanonical = await createFixture("admin-canonical");
    await setCanonicalPhoto(adminCanonical, "webp");
    if (!(await readiness(adminCanonical.id)).eligible) throw new Error("Admin did not see an eligible canonical-photo profile.");
    fail((await complete(admin, adminCanonical.id)).error, "Admin canonical-photo completion failed");

    const superAdminHandoff = await createFixture("superadmin-handoff");
    await setPublishedHandoffPhoto(superAdminHandoff);
    if (!(await readiness(superAdminHandoff.id)).eligible) throw new Error("Admin readiness rejected the completed handoff photo.");
    fail((await complete(superAdmin, superAdminHandoff.id)).error, "Super Admin handoff-photo completion failed");

    const missingPhoto = await createFixture("missing-photo");
    const missingReadiness = await readiness(missingPhoto.id);
    if (missingReadiness.eligible || !missingReadiness.missing.includes("profile photo")) throw new Error("Missing photo was not reported by authoritative readiness.");
    expectFailure(await complete(admin, missingPhoto.id), /required onboarding/i, "Missing photo completion");

    const deletedPhoto = await createFixture("deleted-photo");
    const deletedPath = await setCanonicalPhoto(deletedPhoto);
    fail((await service.storage.from("profile-photos").remove([deletedPath])).error, "Unable to remove deleted-photo fixture object");
    const deletedReadiness = await readiness(deletedPhoto.id);
    if (deletedReadiness.eligible || !deletedReadiness.missing.includes("profile photo")) throw new Error("Deleted photo object was treated as saved.");

    const otherPhotoOwner = await createFixture("other-photo-owner");
    const otherPhotoPath = await setCanonicalPhoto(otherPhotoOwner);
    const crossProfile = await createFixture("cross-profile-photo", { photo_path: otherPhotoPath });
    const crossReadiness = await readiness(crossProfile.id);
    if (crossReadiness.eligible || !crossReadiness.missing.includes("profile photo")) throw new Error("Cross-profile photo reference was accepted.");

    const invalidProfile = await createFixture("invalid-fields", { first_name: "", phone: "123" });
    const invalidReadiness = await readiness(invalidProfile.id);
    if (!invalidReadiness.missing.includes("first name") || !invalidReadiness.missing.includes("phone")) throw new Error("Missing name or invalid phone was not reported.");

    const unpublished = await createFixture("unpublished-handoff");
    const unpublishedPath = `profiles/${unpublished.id}/handoffs/${randomUUID()}.avif`;
    const unpublishedToken = randomUUID().replaceAll("-", "");
    const { error: handoffInsertError } = await service.from("profile_photo_handoffs").insert({ profile_id: unpublished.id, token_hash: unpublishedToken, expires_at: new Date(Date.now() + 60_000).toISOString() });
    fail(handoffInsertError, "Unable to prepare unpublished handoff fixture");
    const { error: unpublishedUploadError } = await service.storage.from("profile-photos").upload(unpublishedPath, image, { contentType: "image/avif", upsert: false });
    fail(unpublishedUploadError, "Unable to prepare unpublished photo object");
    unpublished.paths.push(unpublishedPath);
    fail((await service.from("profiles").update({ photo_path: unpublishedPath }).eq("id", unpublished.id)).error, "Unable to link unpublished fixture photo");
    const unpublishedReadiness = await readiness(unpublished.id);
    if (unpublishedReadiness.eligible || !unpublishedReadiness.missing.includes("profile photo")) throw new Error("Unpublished handoff photo was accepted.");

    const inactive = await createFixture("inactive", { status: "active" });
    await setCanonicalPhoto(inactive);
    const inactiveReadiness = await readiness(inactive.id);
    if (inactiveReadiness.eligible || inactiveReadiness.stateEligible || !inactiveReadiness.missing.includes("onboarding status")) throw new Error("Non-onboarding profile was eligible.");
    expectFailure(await complete(admin, inactive.id), /required onboarding/i, "Inactive profile completion");

    const alreadyCompleted = await createFixture("already-completed");
    await setCanonicalPhoto(alreadyCompleted);
    fail((await complete(admin, alreadyCompleted.id)).error, "Initial completion before duplicate check failed");
    expectFailure(await complete(admin, alreadyCompleted.id), /required onboarding/i, "Duplicate completion");

    const concurrent = await createFixture("concurrent");
    await setCanonicalPhoto(concurrent);
    const concurrentResults = await Promise.all([complete(admin, concurrent.id), complete(admin, concurrent.id)]);
    if (concurrentResults.filter((result) => !result.error).length !== 1) throw new Error("Concurrent completion did not serialize to one success.");

    for (const [label, caller] of [["Author", author], ["Campus Lead", campusLead], ["Coach", coach], ["Counselor", counselor], ["Couple", couple], ["anonymous", client(url, publishableKey)]] as const) {
      const deniedReadiness = await (caller as unknown as RpcClient).rpc("admin_get_onboarding_readiness", { target_profile_id: adminCanonical.id });
      if (!deniedReadiness.error) throw new Error(`${label} accessed Admin onboarding readiness unexpectedly.`);
      if (!(await complete(caller, inactive.id)).error) throw new Error(`${label} completed another user's onboarding unexpectedly.`);
    }

    console.log("DEV onboarding completion verification passed: shared readiness, canonical and completed handoff photos, Admin/Super Admin authorization, rejected invalid states/photos, non-admin role and anonymous denials, and concurrent single completion.");
  } finally {
    const cleanupFailures: string[] = [];
    for (const fixture of fixtures) {
      const { data: handoffs } = await service.from("profile_photo_handoffs").select("upload_object_path").eq("profile_id", fixture.id);
      const paths = [...new Set([...fixture.paths, ...(handoffs ?? []).map((row) => row.upload_object_path).filter((path): path is string => Boolean(path))])];
      if (paths.length) {
        const { error } = await service.storage.from("profile-photos").remove(paths);
        if (error) cleanupFailures.push("storage");
      }
      const { error: profileError } = await service.from("profiles").delete().eq("id", fixture.id);
      if (profileError) cleanupFailures.push("profile");
      const { error: userError } = await service.auth.admin.deleteUser(fixture.id);
      if (userError) cleanupFailures.push("auth");
      const { data: userCheck } = await service.auth.admin.getUserById(fixture.id);
      if (userCheck.user) cleanupFailures.push("auth verification");
    }
    if (cleanupFailures.length) throw new Error(`Synthetic DEV fixture cleanup failed (${cleanupFailures.length} checks).`);
  }
}

await main();
