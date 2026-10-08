import { createElement, type ImgHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/image", () => ({ default: ({ unoptimized, ...props }: Record<string, unknown>) => { void unoptimized; return createElement("img", props as ImgHTMLAttributes<HTMLImageElement>); } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("a", props, children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./people-detail-actions", () => ({ PeopleDetailActions: () => null }));
vi.mock("./resend-invitation-button", () => ({ ResendInvitationButton: () => null }));
vi.mock("./resend-setup-button", () => ({ ResendSetupButton: () => null }));
vi.mock("./relationship-card", () => ({ RelationshipCard: ({ title }: { title: string }) => createElement("section", null, createElement("h2", null, title)) }));
vi.mock("./team-lifecycle", () => ({ TeamLifecycle: () => null }));
vi.mock("./person-lifecycle", () => ({ PersonLifecycle: () => null }));
vi.mock("./unassign-counselor-of-record", () => ({ UnassignCounselorOfRecord: () => null }));
vi.mock("./unassign-operational-relationship", () => ({ UnassignOperationalRelationship: () => null }));
vi.mock("./operational-hierarchy", () => ({ OperationalHierarchyDialog: () => null }));
vi.mock("@/features/onboarding/admin-recovery", () => ({ AdminOnboardingRecovery: () => null }));
vi.mock("@/features/prepare-enrich/actions", () => ({ reservePrepareEnrichUpload: vi.fn(), finishPrepareEnrichUpload: vi.fn() }));

import { PeopleDetailPage } from "./people-detail-page";
import type { PeopleDetailActionContext } from "./detail-actions-model";
import type { GroupPeopleDetail } from "./detail-model";

const detail: GroupPeopleDetail = {
  kind: "group",
  id: "couple-1",
  type: "couples",
  name: "Jordan & Casey",
  campusId: "campus-1",
  campus: "Fremont",
  updatedAt: "2026-10-01T12:00:00.000Z",
  members: [],
  counselingStatus: "active",
  activeAssignmentCount: 1,
  assignmentSummary: "Counselor assigned",
  coachAssignment: null,
  counselorAssignment: "Fremont Counselor Team",
  campusLeadAssignment: null,
  supervisionSummary: "No Coach assigned",
  operationalStatuses: [{ label: "Active", tone: "positive" }],
  assignedCouples: [],
};

const context: PeopleDetailActionContext = {
  mode: "admin",
  selfTarget: null,
  campusLeadTargets: [],
  eligibleCouples: [],
  campuses: [],
  counselorTeams: [],
  coachTeams: [],
  eligibleCounselingTeams: [],
  campusLeadCoachTeams: [],
  currentCounselorTeam: { id: "team-1", name: "Fremont Counselor Team", campus: "Fremont", type: "counselor" },
  currentCoachTeam: null,
  currentCounselorTeams: [],
  currentCampusLeadCoaches: [],
  currentCoupleTeam: null,
  currentCoupleAssignmentType: null,
  coupleCampusId: "campus-1",
  coupleAssignmentReady: true,
};

describe("Admin Couple detail right rail", () => {
  it("keeps Prepare & Enrich after Counselor and preserves both document slots and actions", () => {
    const markup = renderToStaticMarkup(createElement(PeopleDetailPage, {
      detail,
      context,
      breadcrumbs: [{ label: "People & Teams", href: "/people" }, { label: detail.name, current: true }],
      trail: [detail.id],
      prepareEnrich: {
        counselingCaseId: "case-1",
        documents: [{ id: "document-1", slot: "counselor", fileName: "counselor.pdf", contentType: "application/pdf", sizeBytes: 12 }],
      },
    }));
    const rail = markup.slice(markup.indexOf("<aside"), markup.indexOf("</aside>"));

    expect(rail.indexOf("Counseling Status")).toBeLessThan(rail.indexOf("Counselor"));
    expect(rail.indexOf("Counselor")).toBeLessThan(rail.indexOf("Prepare &amp; Enrich"));
    expect(rail).toContain("Counselor Version");
    expect(rail).toContain("Couple Version");
    expect(rail).toContain("counselor.pdf");
    expect(rail).toContain(">Replace<");
    expect(rail).toContain(">Upload<");
  });
});
