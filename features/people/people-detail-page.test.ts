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
vi.mock("./team-lifecycle", () => ({ TeamLifecycle: ({ isSuperAdmin }: { isSuperAdmin: boolean }) => isSuperAdmin ? createElement("button", null, "Permanently Delete") : null }));
vi.mock("./person-lifecycle", () => ({ PersonLifecycle: () => null }));
vi.mock("./unassign-counselor-of-record", () => ({ UnassignCounselorOfRecord: () => null }));
vi.mock("./unassign-operational-relationship", () => ({ UnassignOperationalRelationship: () => null }));
vi.mock("./operational-hierarchy", () => ({ OperationalHierarchyDialog: () => null }));
vi.mock("@/features/onboarding/admin-recovery", () => ({ AdminOnboardingRecovery: () => null }));
vi.mock("@/features/prepare-enrich/actions", () => ({ reservePrepareEnrichUpload: vi.fn(), finishPrepareEnrichUpload: vi.fn() }));

import { PeopleDetailPage } from "./people-detail-page";
import { CoupleSessionsTab } from "./people-detail-page";
import { PrepareEnrichAdminManager } from "@/features/prepare-enrich/admin-manager";
import type { PeopleDetailActionContext } from "./detail-actions-model";
import type { GroupPeopleDetail } from "./detail-model";
import type { CounselorAssessment } from "@/features/assessments/counselor-management-model";

const assessmentSummaryFixture = {
  id: "assessment-1", title: "Communication Styles", description: null, publishedVersionId: "version-1", publishedVersionNumber: 1,
  systemDefaultSessionId: null, schedule: { id: "schedule-1", sessionId: "session-1", caseSessionId: null, progressionCaseSessionId: null, requiredForProgression: true, source: "system_default" },
  partners: [],
} satisfies CounselorAssessment;

const detail: GroupPeopleDetail = {
  kind: "group",
  id: "couple-1",
  type: "couples",
  name: "Jordan & Casey",
  campusId: "campus-1",
  campus: "Fremont",
  updatedAt: "2026-10-01T12:00:00.000Z",
    members: [
      { id: "partner-1", firstName: "Jordan", lastName: "Smith", name: "Jordan Smith", gender: "male", email: "jordan@example.test", phone: "5105550101", campusId: "campus-1", photoUrl: "https://example.test/jordan.jpg", roles: ["couple"], accountStatus: "Active", accountAccessState: "active_account", onboardingStatus: "Onboarding Complete", onboardingComplete: true },
      { id: "partner-2", firstName: "Casey", lastName: "Smith", name: "Casey Smith", gender: "female", email: "casey@example.test", phone: "5105550102", campusId: "campus-1", photoUrl: null, roles: ["couple"], accountStatus: "Active", accountAccessState: "active_account", onboardingStatus: "Onboarding Complete", onboardingComplete: true },
    ],
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

describe("Admin Couple detail tabs and rail", () => {
  it("renders four accessible tabs and keeps concise Couple context in the persistent rail", () => {
    const props = {
      detail,
      breadcrumbs: [{ label: "People & Teams", href: "/people" }, { label: detail.name, current: true as const }],
      trail: [detail.id],
      assessmentManagement: { assessments: [assessmentSummaryFixture], sessions: [], preferences: {} },
      prepareEnrich: { counselingCaseId: "case-1", documents: [] },
      sessionSummary: {
        caseId: "case-1", coupleId: detail.id, coupleName: detail.name, partners: [], status: "active", state: { label: "SESSION 1", detail: "Communication", caseSession: null, session: null }, publishedSessions: [], team: { campusLead: null, coach: null, counselor: null }, homework: null, materialSessions: [],
        homeworkSessions: [{ caseSessionId: "case-session-1", sessionId: "session-1", title: "Communication", actualSequence: 1, templateSequence: 1, status: "active" as const, revisionAssigned: true, partners: [{ progressId: "progress-1", profileId: "partner-1", name: "Jordan", status: "submitted" as const }, { progressId: "progress-2", profileId: "partner-2", name: "Casey", status: "not_started" as const }] }],
      } as never,
    };
    const adminMarkup = renderToStaticMarkup(createElement(PeopleDetailPage, { ...props, context }));
    expect(adminMarkup).toContain('role="tablist"');
    expect(adminMarkup).toContain('aria-label="Couple details sections"');
    expect(adminMarkup.match(/role="tab"/g)).toHaveLength(4);
    expect(adminMarkup).toContain("Overview");
    expect(adminMarkup).toContain("Sessions &amp; Homework");
    expect(adminMarkup).toContain("Assessments");
    expect(adminMarkup).toContain("Prepare &amp; Enrich");
    expect(adminMarkup).toContain("Counseling: In Progress");
    expect(adminMarkup).toContain("Current Session");
    expect(adminMarkup).toContain("0 of 1 required complete");
    expect(adminMarkup).not.toContain("Communication Styles");
    expect(adminMarkup).toContain('role="tabpanel"');
    expect(adminMarkup).toContain('role="tabpanel" aria-labelledby');
    expect(adminMarkup).not.toContain("Counseling Status</p>");
    expect(adminMarkup).toContain("Jordan Smith");
    expect(adminMarkup).toContain("Casey Smith");
    expect(adminMarkup).toContain("size-20 rounded-full");
    expect(adminMarkup).not.toContain("View Homework");

    const nonAdminMarkup = renderToStaticMarkup(createElement(PeopleDetailPage, { ...props, context: null }));
    expect(nonAdminMarkup).not.toContain('role="tablist"');
    expect(nonAdminMarkup).not.toContain("Communication Styles");
  });

  it("preserves Prepare & Enrich document slots and upload actions in separate cards", () => {
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
    expect(markup).not.toContain("Counselor Version");
    const managerMarkup = renderToStaticMarkup(createElement(PrepareEnrichAdminManager, {
      coupleGroupId: detail.id,
      counselingCaseId: "case-1",
      documents: [{ id: "document-1", slot: "counselor", fileName: "counselor.pdf", contentType: "application/pdf", sizeBytes: 12 }],
    }));
    expect(managerMarkup).toContain("Counselor Version");
    expect(managerMarkup).toContain("Couple Version");
    expect(managerMarkup).toContain("counselor.pdf");
    expect(managerMarkup).toContain(">Replace<");
    expect(managerMarkup).toContain(">Upload<");
    expect(markup).toContain('aria-label="Couple details sections"');
  });

  it("shows per-partner Homework status in the Sessions tab without adding an Admin review link", () => {
    const sessionSummary = {
      homeworkSessions: [{ caseSessionId: "case-session-1", sessionId: "session-1", title: "Communication", actualSequence: 1, templateSequence: 1, status: "active" as const, revisionAssigned: true, partners: [{ progressId: "progress-1", profileId: "partner-1", name: "Jordan Smith", status: "submitted" as const }, { progressId: "progress-2", profileId: "partner-2", name: "Casey Smith", status: "not_started" as const }] }],
    } as never;
    const markup = renderToStaticMarkup(createElement(CoupleSessionsTab, { sessionSummary }));
    expect(markup).toContain("Session 1: Communication");
    expect(markup).toContain("Jordan Smith");
    expect(markup).toContain("Casey Smith");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("Not Started");
    expect(markup).not.toContain("View Homework");
  });

  it("keeps Super Admin deletion discoverable in the danger area", () => {
    const markup = renderToStaticMarkup(createElement(PeopleDetailPage, {
      detail,
      context,
      breadcrumbs: [{ label: detail.name, current: true }],
      trail: [detail.id],
      isSuperAdmin: true,
    }));
    const danger = markup.slice(markup.indexOf("Danger Zone"));
    expect(danger).toContain("Permanently Delete");
  });
});

describe("read-only supervisory team detail", () => {
  it("reuses member cards while omitting administrative and Couple assignment controls", () => {
    const team: GroupPeopleDetail = {
      ...detail,
      id: "counselor-team",
      type: "counselors",
      name: "John & Stacy Wu",
      assignedCouples: [],
      members: [{
        id: "john", firstName: "John", lastName: "Wu", name: "John Wu", gender: "male", email: "john@example.test", phone: "5105550101", campusId: "campus-1", photoPath: "john.jpg", roles: ["counselor"], accountStatus: "Active", accountAccessState: "active_account", onboardingStatus: "Onboarding Complete", onboardingComplete: true, photoUrl: "https://photos.example.test/john.jpg",
      }],
    };
    const markup = renderToStaticMarkup(createElement(PeopleDetailPage, {
      detail: team,
      context: null,
      breadcrumbs: [{ label: "Workspace", href: "/workspace" }, { label: "Counselors" }, { label: team.name, current: true }],
      trail: [],
      isSuperAdmin: true,
      readOnlySupervisoryView: true,
    }));

    expect(markup).toContain("Counselor Members");
    expect(markup).toContain("John Wu");
    expect(markup).toContain("john@example.test");
    expect(markup).toContain("(510) 555-0101");
    expect(markup).toContain('src="https://photos.example.test/john.jpg"');
    expect(markup).toContain("Onboarding: Complete");
    expect(markup).not.toContain("Permanently Delete");
    expect(markup).not.toContain("Assigned Couples");
    expect(markup).not.toContain("Assign");
  });
});
