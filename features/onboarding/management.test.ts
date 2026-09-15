import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  requireWorkspace: vi.fn(),
  rpc: vi.fn(),
  store: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ rpc: mocks.rpc }) }));
vi.mock("./profile-photo-server", () => ({
  isProfilePhotoUpload: () => true,
  removeNewProfilePhoto: mocks.cleanup,
  storeProfilePhoto: mocks.store,
}));

const profileId = "11111111-1111-1111-1111-111111111111";

describe("admin recovery photo upload", () => {
  beforeEach(() => {
    mocks.cleanup.mockReset();
    mocks.requireWorkspace.mockReset();
    mocks.rpc.mockReset();
    mocks.store.mockReset();
  });

  it("preflights canonical incompleteness before storing a new AVIF", async () => {
    mocks.requireWorkspace.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: null });
    mocks.store.mockResolvedValue({ success: true, path: `profiles/${profileId}/avatar.avif`, replacedExisting: false });
    const { uploadAdminProfilePhoto } = await import("./management");
    const form = new FormData();
    form.set("profileId", profileId);
    form.set("photo", new File(["image"], "profile.jpg", { type: "image/jpeg" }));

    await expect(uploadAdminProfilePhoto(form)).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "admin_assert_incomplete_profile", { target_profile_id: profileId });
    expect(mocks.store).toHaveBeenCalledWith(profileId, expect.any(File));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "admin_set_profile_photo", { target_profile_id: profileId });
  });

  it("does not upload when an ordinary user is denied before the preflight", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("Not authorized"));
    const { uploadAdminProfilePhoto } = await import("./management");
    const form = new FormData();
    form.set("profileId", profileId);
    form.set("photo", new File(["image"], "profile.jpg", { type: "image/jpeg" }));

    await expect(uploadAdminProfilePhoto(form)).rejects.toThrow("Not authorized");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("cleans up only a newly created AVIF when the final recovery update fails", async () => {
    mocks.requireWorkspace.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Profile changed" } });
    mocks.store.mockResolvedValue({ success: true, path: `profiles/${profileId}/avatar.avif`, replacedExisting: false });
    const { uploadAdminProfilePhoto } = await import("./management");
    const form = new FormData();
    form.set("profileId", profileId);
    form.set("photo", new File(["image"], "profile.jpg", { type: "image/jpeg" }));

    await expect(uploadAdminProfilePhoto(form)).resolves.toEqual({ error: "Profile changed" });
    expect(mocks.cleanup).toHaveBeenCalledWith(`profiles/${profileId}/avatar.avif`);
  });

  it("preserves an existing AVIF if the final recovery update fails", async () => {
    mocks.requireWorkspace.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "Profile changed" } });
    mocks.store.mockResolvedValue({ success: true, path: `profiles/${profileId}/avatar.avif`, replacedExisting: true });
    const { uploadAdminProfilePhoto } = await import("./management");
    const form = new FormData();
    form.set("profileId", profileId);
    form.set("photo", new File(["image"], "profile.jpg", { type: "image/jpeg" }));

    await uploadAdminProfilePhoto(form);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
});
