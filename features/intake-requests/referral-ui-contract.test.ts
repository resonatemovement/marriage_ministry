import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const action = readFileSync("features/intake-requests/status-actions.ts", "utf8");
const manager = readFileSync("features/intake-requests/status-manager.tsx", "utf8");
const detailRoute = readFileSync("app/intake-requests/[requestId]/page.tsx", "utf8");
const pages = readFileSync("features/intake-requests/intake-pages.tsx", "utf8");

describe("Intake referral UI and server-action contract", () => {
  it("requires Admin or campus-scoped Campus Lead workspace for actions and retains Admin-only invitation guard", () => {
    expect(action).toContain('requireOneOfWorkspaces(["admin", "campus_lead"]');
    expect(action).toContain('await requireWorkspace("admin", "/intake-requests")');
    expect(detailRoute).toContain("canInvite={isAdmin}");
  });

  it("requires a valid reason before showing confirmation and validates it again server-side", () => {
    expect(manager).toContain('maxLength={500}');
    expect(manager).toContain("action === \"refer_elsewhere\" && !validReferralReason");
    expect(manager).toContain("disabled={pending || !validReferralReason}");
    expect(manager).toContain("Confirm Referral");
    expect(action).toContain("normalizeIntakeReferralReason(reasonDetail)");
  });

  it("keeps status filtering and displays the historical referral reason in request activity", () => {
    expect(manager).toContain('"@/components/ui/alert-dialog"');
    expect(pages).toContain('item.toStatus === "referred_elsewhere"');
    expect(pages).toContain("Referral reason:");
    expect(detailRoute).toContain("canManageIntake");
  });
});
