import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const manager = read("features/intake-requests/status-manager.tsx");
const deleteDialog = read("features/intake-requests/delete-request.tsx");
const statusActions = read("features/intake-requests/status-actions.ts");
const deleteActions = read("features/intake-requests/delete-actions.ts");
const queue = read("features/intake-requests/intake-pages.tsx");

describe("Intake Request toast feedback", () => {
  it("uses one action-specific toast for confirmed review status transitions", () => {
    expect(manager).toContain("showErrorToast(result.error)");
    expect(manager).toContain('"Intake request review started successfully."');
    expect(manager).toContain('"Intake request closed successfully."');
    expect(manager).toContain('"Intake request reopened successfully."');
    expect(manager).not.toContain("setMessage");
    expect(manager).not.toContain('role="status"');
    expect(manager).not.toContain('role="alert"');
    expect(statusActions).toContain('requireWorkspace("admin", "/intake-requests")');
    expect(statusActions).toContain("isIntakeRequestAction(action)");
  });

  it("keeps invitation creation and email delivery outcomes distinct and honest", () => {
    expect(manager).toContain("result.delivery === \"partial\"");
    expect(manager).toContain("Couple invitations were created, but one or more email deliveries need a retry in People.");
    expect(manager).toContain("Couple invitations were created and email delivery was initiated.");
    expect(manager).toContain("Couple invitations already exist. Manage delivery retries from People.");
    expect(manager).not.toContain("created and sent");
    expect(manager).not.toContain("delivered");
    expect(statusActions).toContain('delivery: outcomes.every(Boolean) ? "complete" : "partial"');
  });

  it("preserves close-reason validation, form values, and pending duplicate protection", () => {
    expect(manager).toContain("reasonCode === \"other\" && !reasonDetail.trim()");
    expect(manager).toContain("value={reasonDetail}");
    expect(manager).toContain("disabled={pending || !action");
    expect(manager).toContain("onValueChange={setReasonCode}");
  });

  it("keeps the DELETE confirmation and redirect while reporting results only through toasts", () => {
    expect(deleteDialog).toContain("isDeleteConfirmation(confirmation)");
    expect(deleteDialog).toContain("disabled={pending || !isDeleteConfirmation(confirmation)}");
    expect(deleteDialog).toContain("showErrorToast(result.error)");
    expect(deleteDialog).toContain('showSuccessToast("Intake request deleted successfully.")');
    expect(deleteDialog).toContain('router.push("/intake-requests")');
    expect(deleteDialog).not.toContain("setMessage");
    expect(deleteActions).toContain('identity.roles.includes("super_admin")');
    expect(deleteActions).toContain("intakeDeleteMessage(");
  });

  it("removes the duplicate deletion success message from the destination page", () => {
    expect(queue).not.toContain("Intake request deleted.");
    expect(queue).toContain('role="alert"'); // Queue read failures remain visible and are not mutation feedback.
  });
});
