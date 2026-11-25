import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireOneOfRoles, createServerSupabaseClient, revalidatePath, rpc } = vi.hoisted(() => ({
  requireOneOfRoles: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireOneOfRoles }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient }));

import { resetCounselingJourney } from "./actions";

function form(confirmation = "RESET") {
  const data = new FormData();
  data.set("caseId", "case-dev-test-id");
  data.set("confirmation", confirmation);
  return data;
}

describe("resetCounselingJourney server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://lctkqjjkhpyootwvttvj.supabase.co");
    requireOneOfRoles.mockResolvedValue({ id: "authorized-super-admin" });
    rpc.mockResolvedValue({ data: null, error: null });
    createServerSupabaseClient.mockResolvedValue({ rpc });
  });

  it("requires exact RESET before calling the RPC", async () => {
    await expect(resetCounselingJourney(form("reset"))).resolves.toEqual({
      error: "Type exact uppercase RESET to continue.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a non-DEV Supabase target before calling the RPC", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://production-project.supabase.co");

    await expect(resetCounselingJourney(form())).resolves.toEqual({
      error: "Counseling journey reset is available only in DEV.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves the Super Admin authorization gate", async () => {
    requireOneOfRoles.mockRejectedValueOnce(new Error("Not authorized"));

    await expect(resetCounselingJourney(form())).rejects.toThrow("Not authorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a safe linked-history explanation and logs the failing operation", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: "23503",
        message: "update or delete violates homework_completion_notification_attempts_notification_id_fkey",
        details: "internal database detail",
        hint: "internal database hint",
      },
    });

    await expect(resetCounselingJourney(form())).resolves.toEqual({
      error: "Reset was blocked by linked Homework notification history. No changes were retained.",
    });
    expect(log).toHaveBeenCalledWith("DEV counseling journey reset RPC failed", {
      operation: "reset_counseling_journey",
      caseId: "case-dev-test-id",
      code: "23503",
      message: "update or delete violates homework_completion_notification_attempts_notification_id_fkey",
      details: "internal database detail",
      hint: "internal database hint",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("keeps unrecognized database errors generic to the browser", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "sensitive db details" } });

    await expect(resetCounselingJourney(form())).resolves.toEqual({
      error: "Unable to reset counseling case. Please try again.",
    });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("reports success and revalidates only after the reset RPC succeeds", async () => {
    await expect(resetCounselingJourney(form())).resolves.toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith("reset_counseling_journey", {
      target_case_id: "case-dev-test-id",
      reset_confirmation: "RESET",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/workspace");
    expect(revalidatePath).toHaveBeenCalledWith("/workspace/cases/case-dev-test-id");
  });
});
