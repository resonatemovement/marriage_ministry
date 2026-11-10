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
    expect(manager).toContain("selectedAction === \"refer_elsewhere\" && !validReferralReason");
    expect(manager).toContain('disabled={pending || selectedAction !== "refer_elsewhere" || !validReferralReason}');
    expect(manager).toContain("Confirm Referral");
    expect(action).toContain("normalizeIntakeReferralReason(reasonDetail)");
  });

  it("keeps status filtering and displays the historical referral reason in request activity", () => {
    expect(manager).toContain('"@/components/ui/alert-dialog"');
    expect(pages).toContain('item.toStatus === "referred_elsewhere"');
    expect(pages).toContain("Referral reason:");
    expect(detailRoute).toContain("canManageIntake");
  });

  it("clears transient state and refreshes after successful transitions but preserves input on failure", () => {
    expect(manager).toContain('key={`${props.requestId}:${props.status}`}');
    expect(manager).toContain('selection?.status === status ? intakeActionForStatus(status, selection.action, canInvite) : ""');
    expect(manager).toContain("setSelection({ status, action: value as IntakeRequestAction });");
    expect(manager).toContain("function resetFormState()");
    expect(manager).toContain("setSelection(null);");
    expect(manager).toContain('setReasonCode("");');
    expect(manager).toContain('setReasonDetail("");');
    expect(manager).toContain("router.refresh();");
    expect(manager).toContain('<SelectValue placeholder="Choose an action" />');

    const transition = manager.slice(manager.indexOf("const result = await takeIntakeRequestAction(form);"));
    expect(transition.indexOf('if ("error" in result)')).toBeLessThan(transition.indexOf("resetFormState();"));
    expect(transition).toContain("disabled={pending || !selectedAction");
  });
});
