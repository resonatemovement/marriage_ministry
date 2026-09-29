import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ claims: vi.fn(), profile: vi.fn(), roles: vi.fn(), from: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({
  auth: { getClaims: mock.claims },
  from: mock.from,
}) }));

import { getAuthenticatedIdentity } from "./session";

describe("getAuthenticatedIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.claims.mockResolvedValue({ data: { claims: { sub: "john-id" } }, error: null });
    mock.profile.mockResolvedValue({ data: { first_name: "John", last_name: "Walker", email: "john@example.test", status: "active" }, error: null });
    mock.roles.mockResolvedValue({ data: [{ role: "super_admin" }, { role: "coach" }], error: null });
    mock.from.mockImplementation((table: string) => table === "profiles"
      ? { select: () => ({ eq: () => ({ maybeSingle: mock.profile }) }) }
      : { select: () => ({ eq: mock.roles }) });
  });

  it("returns the verified subject and every recognized role for a multi-role account", async () => {
    await expect(getAuthenticatedIdentity()).resolves.toEqual({
      id: "john-id", displayName: "John Walker", roles: ["super_admin", "coach"],
      workspaces: ["admin", "coach"], onboardingRequired: false, accountStage: "active",
    });
  });

  it("preserves a successful, genuinely role-less active profile", async () => {
    mock.roles.mockResolvedValue({ data: [], error: null });
    await expect(getAuthenticatedIdentity()).resolves.toMatchObject({ id: "john-id", accountStage: "active", roles: [], workspaces: [] });
  });

  it("surfaces a role query failure without exposing its details", async () => {
    mock.roles.mockResolvedValue({ data: null, error: { message: "sensitive role query details" } });
    await expect(getAuthenticatedIdentity()).rejects.toThrow("Your account roles could not be loaded. Please try again.");
  });

  it("surfaces a profile query failure without treating it as a missing profile", async () => {
    mock.profile.mockResolvedValue({ data: null, error: { message: "sensitive profile query details" } });
    await expect(getAuthenticatedIdentity()).rejects.toThrow("Your profile could not be loaded. Please try again.");
  });

  it("surfaces an auth verification error separately from no subject", async () => {
    mock.claims.mockResolvedValue({ data: null, error: { message: "sensitive token details" } });
    await expect(getAuthenticatedIdentity()).rejects.toThrow("Your session could not be verified. Please try again.");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("does not expose thrown Supabase errors", async () => {
    mock.claims.mockRejectedValueOnce(new Error("sensitive token details"));
    await expect(getAuthenticatedIdentity()).rejects.toThrow("Your session could not be verified. Please try again.");
    mock.profile.mockRejectedValueOnce(new Error("sensitive database details"));
    await expect(getAuthenticatedIdentity()).rejects.toThrow("Your account information could not be loaded. Please try again.");
  });

  it("returns null when there is no authenticated subject", async () => {
    mock.claims.mockResolvedValue({ data: null, error: null });
    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("keeps a missing profile without active permissions", async () => {
    mock.profile.mockResolvedValue({ data: null, error: null });
    await expect(getAuthenticatedIdentity()).resolves.toMatchObject({ id: "john-id", roles: [], workspaces: [], accountStage: "unknown" });
  });

  it("keeps a deactivated profile without active permissions", async () => {
    mock.profile.mockResolvedValue({ data: { first_name: "John", last_name: "Walker", email: "john@example.test", status: "deactivated" }, error: null });
    await expect(getAuthenticatedIdentity()).resolves.toMatchObject({ id: "john-id", roles: [], workspaces: [], accountStage: "unknown" });
  });
});
