import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const inviteForm = read("features/people/invite-people-form.tsx");
const detailActions = read("features/people/people-detail-actions.tsx");
const assignedCouples = read("features/people/assigned-couples.tsx");
const unassignCase = read("features/people/unassign-counselor-of-record.tsx");
const unassignRelationship = read("features/people/unassign-operational-relationship.tsx");
const personLifecycle = read("features/people/person-lifecycle.tsx");
const teamLifecycle = read("features/people/team-lifecycle.tsx");
const resendInvitation = read("features/people/resend-invitation-button.tsx");
const resendSetup = read("features/people/resend-setup-button.tsx");

describe("People & Teams toast feedback", () => {
  it("keeps invitation field validation and pending state while reporting complete, partial, and failed outcomes once", () => {
    expect(inviteForm).toContain("validateInvitation(role, campus, people)");
    expect(inviteForm).toContain("disabled={!valid || pending}");
    expect(inviteForm).toContain("if (\"error\" in result) { showErrorToast(result.error); return; }");
    expect(inviteForm).toContain('if (result.delivery === "partial") showErrorToast(message); else showSuccessToast(message);');
    expect(inviteForm).toContain("invitationSuccessMessage(result)");
    expect(inviteForm).not.toContain("serverError");
    expect(inviteForm).not.toContain("<p role=\"alert\">{success}");
  });

  it("uses one shared feedback path for member, Couple, team, and assignment edits", () => {
    expect(detailActions).toContain("showErrorToast(result.error)");
    expect(detailActions).toContain("showSuccessToast(successMessage)");
    expect(detailActions).toContain('"Member information updated successfully."');
    expect(detailActions).toContain('"Couple information updated successfully."');
    expect(detailActions).toContain('"Team updated successfully."');
    expect(detailActions).toContain('"Counselor assigned successfully."');
    expect(detailActions).toContain("disabled={pending}");
    expect(detailActions).toContain("router.refresh()");
    expect(detailActions).not.toContain("setServerError");
  });

  it("covers Couple assignment and unassignment without losing sheet state on failure", () => {
    for (const source of [assignedCouples, unassignCase, unassignRelationship]) {
      expect(source).toContain("showErrorToast(result.error)");
      expect(source).toContain("showSuccessToast(");
      expect(source).toContain("disabled={pending}");
      expect(source).toContain("router.refresh()");
      expect(source).not.toContain("window.location.reload()");
    }
    expect(assignedCouples).toContain('"Couple assigned successfully."');
    expect(unassignCase).toContain('"Counselor unassigned successfully."');
    expect(unassignRelationship).toContain('"Coach unassigned successfully."');
  });

  it("keeps lifecycle confirmations and redirects while sending operation feedback through toasts", () => {
    expect(personLifecycle).toContain("confirmation !== \"DELETE\"");
    expect(personLifecycle).toContain("showErrorToast(result.error)");
    expect(personLifecycle).toContain('active ? "Person deactivated successfully." : "Person reactivated successfully."');
    expect(personLifecycle).toContain('showSuccessToast("Person deleted successfully.")');
    expect(personLifecycle).toContain('router.push("/people")');
    expect(teamLifecycle).toContain("confirmation !== \"DELETE\"");
    expect(teamLifecycle).toContain("showErrorToast(result.error)");
    expect(teamLifecycle).toContain("showSuccessToast(`${label} deleted successfully.`)");
    expect(teamLifecycle).toContain("intakeRequestId");
  });

  it("uses the shared toast API for resend actions without implying delivery from invitation creation", () => {
    for (const source of [resendInvitation, resendSetup]) {
      expect(source).toContain("showErrorToast(result.error)");
      expect(source).toContain("showSuccessToast(");
      expect(source).toContain("disabled={pending}");
      expect(source).not.toContain('role="status"');
    }
    expect(inviteForm).toContain('result.delivery === "partial"');
    expect(inviteForm).toContain("showErrorToast(message)");
  });
});
