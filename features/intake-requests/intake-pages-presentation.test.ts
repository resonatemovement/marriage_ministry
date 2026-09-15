import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./status-manager", () => ({
  IntakeStatusManager: ({ isSuperAdmin }: { isSuperAdmin: boolean }) => createElement("section", null, "Start Review", "Send Invite", "Close Request", "Reopen for Review", isSuperAdmin ? "Delete Request" : null),
}));

import { IntakeRequestReview } from "./intake-pages";
import type { IntakeRequestDetail } from "./types";

const request: IntakeRequestDetail = {
  id: "request-a", status: "ready_for_review", relationshipStatus: "engaged", campusName: "Campus A", requestedSupport: ["lay_counselor"], submittedAt: "2026-09-10T00:00:00.000Z",
  people: [
    { id: "person-a", personPosition: "requester", firstName: "Avery", lastName: "Rivera", email: "avery@example.com", phone: "4155550101", city: "Oakland", resonateConnections: ["member"] },
    { id: "person-b", personPosition: "partner", firstName: "Jordan", lastName: "Rivera", email: "jordan@example.com", phone: "4155550102", city: "Oakland", resonateConnections: ["mc"] },
  ],
  weddingDate: "2026-10-10", campusOther: null, currentlyWorkingWithCounselor: false, goals: "Grow together", questions: "What happens next?", referralSource: "friend", referralSourceOther: null,
  history: [{ id: 1, fromStatus: null, toStatus: "ready_for_review", changedAt: "2026-09-10T00:00:00.000Z", changedByName: null, note: null, reasonCode: null, reasonDetail: null }],
  deleteEligible: true,
};

function render(capabilities: Pick<ComponentProps<typeof IntakeRequestReview>, "canManageIntake" | "canDeleteIntake">) {
  return renderToStaticMarkup(createElement(IntakeRequestReview, { request, ...capabilities }));
}

describe("Intake request presentation capabilities", () => {
  it("gives a Campus Lead normal workflow controls without permanent deletion", () => {
    const page = render({ canManageIntake: true, canDeleteIntake: false });

    expect(page).toContain("Couple Information");
    expect(page).toContain("Connection to Resonate");
    expect(page).toContain("Counseling Needs");
    expect(page).toContain("Status History / Activity");
    expect(page).toContain("Start Review");
    expect(page).toContain("Send Invite");
    expect(page).toContain("Close Request");
    expect(page).toContain("Reopen for Review");
    expect(page).not.toContain("Delete Request");
  });

  it("preserves Admin workflow controls", () => {
    const page = render({ canManageIntake: true, canDeleteIntake: false });

    expect(page).toContain("Start Review");
    expect(page).not.toContain("Delete Request");
  });

  it("shows permanent deletion only to an eligible Super Admin", () => {
    const page = render({ canManageIntake: true, canDeleteIntake: true });

    expect(page).toContain("Delete Request");
  });
});
