import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  lookup: vi.fn(),
  remove: vi.fn(),
  store: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.lookup }) }) }),
    rpc: mocks.adminRpc,
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/env", () => ({ getSupabaseEnvironment: () => ({ url: "https://example.supabase.co" }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
vi.mock("./profile-photo-server", () => ({
  removeUnpublishedHandoffPhoto: mocks.remove,
  storeHandoffPhoto: mocks.store,
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const activeClaim = (attemptId: string) => ({
  profile_id: profileId,
  object_path: `profiles/${profileId}/handoffs/${attemptId}.avif`,
  stale_object_path: null,
});

describe("phone photo handoff upload actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_SECRET_KEY = "test-secret";
  });

  it("allows only one of two overlapping requests to claim and publish a token", async () => {
    let claimed = false;
    let resolveStore!: (value: { success: true; path: string; replacedExisting: boolean }) => void;
    mocks.adminRpc.mockImplementation((name: string, args: { target_attempt_id: string }) => {
      if (name === "claim_profile_photo_handoff_upload") {
        if (claimed) return Promise.resolve({ data: null, error: { message: "already claimed" } });
        claimed = true;
        return Promise.resolve({ data: activeClaim(args.target_attempt_id), error: null });
      }
      if (name === "finalize_profile_photo_handoff_upload") return Promise.resolve({ data: true, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    mocks.lookup.mockResolvedValue({ data: { id: "handoff", profile_id: profileId, expires_at: new Date(Date.now() + 60_000).toISOString(), completed_at: null } });
    mocks.store.mockImplementation(() => new Promise((resolve) => { resolveStore = resolve; }));
    const { uploadPhonePhoto } = await import("./handoff-actions");

    const first = uploadPhonePhoto("synthetic-token", new Blob(["one"], { type: "image/jpeg" }));
    const second = uploadPhonePhoto("synthetic-token", new Blob(["two"], { type: "image/jpeg" }));
    const secondResult = await second;
    resolveStore({ success: true, path: "attempt.avif", replacedExisting: false });
    const firstResult = await first;

    expect([firstResult.success, secondResult.success].filter(Boolean)).toHaveLength(1);
    expect(mocks.store).toHaveBeenCalledOnce();
    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === "finalize_profile_photo_handoff_upload")).toHaveLength(1);
  });

  it("releases a failed attempt so the same active token can retry", async () => {
    let activeAttempt: string | null = null;
    mocks.adminRpc.mockImplementation((name: string, args: { target_attempt_id: string }) => {
      if (name === "claim_profile_photo_handoff_upload") {
        activeAttempt = args.target_attempt_id;
        return Promise.resolve({ data: activeClaim(args.target_attempt_id), error: null });
      }
      if (name === "release_profile_photo_handoff_upload") {
        const path = `profiles/${profileId}/handoffs/${args.target_attempt_id}.avif`;
        activeAttempt = null;
        return Promise.resolve({ data: { state: "released", object_path: path }, error: null });
      }
      return Promise.resolve({ data: activeAttempt !== null, error: null });
    });
    mocks.store.mockResolvedValueOnce({ success: false, error: "The image could not be processed." })
      .mockResolvedValueOnce({ success: true, path: "retry.avif", replacedExisting: false });
    const { uploadPhonePhoto } = await import("./handoff-actions");
    const image = new Blob(["synthetic image"], { type: "image/jpeg" });

    await expect(uploadPhonePhoto("synthetic-token", image)).resolves.toMatchObject({ success: false });
    await expect(uploadPhonePhoto("synthetic-token", image)).resolves.toEqual({ success: true });

    expect(mocks.adminRpc.mock.calls.filter(([name]) => name === "claim_profile_photo_handoff_upload")).toHaveLength(2);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("does not delete an object if finalization succeeded but its response was lost", async () => {
    mocks.adminRpc.mockImplementation((name: string, args: { target_attempt_id: string }) => {
      if (name === "claim_profile_photo_handoff_upload") return Promise.resolve({ data: activeClaim(args.target_attempt_id), error: null });
      if (name === "finalize_profile_photo_handoff_upload") return Promise.resolve({ data: null, error: { message: "response lost" } });
      return Promise.resolve({ data: { state: "published", object_path: `profiles/${profileId}/handoffs/${args.target_attempt_id}.avif` }, error: null });
    });
    mocks.store.mockResolvedValue({ success: true, path: "published.avif", replacedExisting: false });
    const { uploadPhonePhoto } = await import("./handoff-actions");

    await expect(uploadPhonePhoto("synthetic-token", new Blob(["image"], { type: "image/jpeg" }))).resolves.toEqual({ success: true });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
