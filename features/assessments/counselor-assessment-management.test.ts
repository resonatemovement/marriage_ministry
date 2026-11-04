import { type ReactNode, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/badge", () => ({ Badge: ({ children }: { children: ReactNode }) => createElement("span", null, children) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, disabled }: { children: ReactNode; disabled?: boolean }) => createElement("button", { disabled }, children) }));
vi.mock("@/components/ui/card", () => ({ Card: ({ children }: { children: ReactNode }) => createElement("div", null, children) }));
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectTrigger: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => createElement("button", props, children),
  SelectValue: () => createElement("span", null, "Selected Session"),
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("radix-ui", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  const Trigger = ({ children }: { children: ReactNode }) => createElement("div", null, children);
  const Content = ({ children }: { children: ReactNode }) => createElement("div", { role: "dialog" }, children);
  const Close = ({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) => createElement("button", props, children);
  return { Dialog: { Root: Wrapper, Trigger, Portal: Wrapper, Overlay: () => null, Content, Title: Wrapper, Description: Wrapper, Close } };
});
vi.mock("./counselor-management-actions", () => ({ saveCaseAssessmentSchedule: vi.fn(), saveCounselorAssessmentPreference: vi.fn() }));

import { AssessmentResultsContent, CounselorAssessmentManagement } from "./counselor-assessment-management";
import type { CounselorAssessment } from "./counselor-management-model";

const assessment: CounselorAssessment = {
  id: "assessment-1", title: "Love Languages", description: "Learn how partners communicate care.",
  publishedVersionId: "version-1", publishedVersionNumber: 1, systemDefaultSessionId: "session-1",
  schedule: { id: "schedule-1", sessionId: "session-1", caseSessionId: "case-session-1", progressionCaseSessionId: "case-session-1", requiredForProgression: true, source: "system_default" },
  partners: [
    { profileId: "profile-a", name: "Alex A", status: "completed", latestScores: [{ label: "Words", score: 12, rank: 1, isPrimary: true }, { label: "Time", score: 12, rank: 1, isPrimary: true }], history: [{ attemptNumber: 1, submittedAt: "2026-10-01T00:00:00Z", scores: [{ label: "Words", score: 12, rank: 1, isPrimary: true }, { label: "Time", score: 12, rank: 1, isPrimary: true }] }] },
    { profileId: "profile-b", name: "Blake B", status: "in_progress", latestScores: [], history: [] },
  ],
};

describe("Counselor Assessment management presentation", () => {
  it("shows compact summaries and a separate, always-visible scheduling section", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment], sessions: [{ id: "session-1", title: "Foundations", sequenceNumber: 1 }],
      preferences: {}, canReadResults: true, canManageSchedule: true, canManagePreference: true, activeCaseSessionId: "case-session-1",
    }));
    expect(markup).toContain("Assessments");
    expect(markup).toContain("Session 1: Foundations");
    expect(markup).toContain("1 of 2 submitted");
    expect(markup).toContain("Blocking Session advancement");
    expect(markup).toContain("Alex A:");
    expect(markup).toContain("> Words, Time</li>");
    expect(markup).toContain("View Results");
    expect(markup).toContain("Scheduling Settings");
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("View score history");
    expect(markup).toContain("My default for future Cases");
    expect(markup).toContain("Existing Case schedules stay unchanged.");
    const schedulingIndex = markup.indexOf('aria-label="Scheduling Settings"');
    const assessmentsIndex = markup.indexOf('aria-label="Assessments"');
    const assessmentsSection = markup.slice(assessmentsIndex);
    expect(schedulingIndex).toBeGreaterThan(-1);
    expect(schedulingIndex).toBeLessThan(assessmentsIndex);
    expect(assessmentsSection).not.toContain("Case Session");
    expect(assessmentsSection).not.toContain("My default for future Cases");
    expect(assessmentsSection).not.toContain("Save Session");
    expect(markup).not.toMatch(/response|answer|scoring key/i);
  });

  it("renders partner status and full-width numeric score rows in responsive results content", () => {
    const markup = renderToStaticMarkup(createElement(AssessmentResultsContent, { assessment }));
    expect(markup).toContain("Alex A");
    expect(markup).toContain("Blake B");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("In Progress");
    expect(markup).toContain("md:grid-cols-2");
    expect(markup).toContain('class="mt-2 space-y-2"');
    expect(markup).toContain("12</span>");
    expect(markup).not.toContain("/12");
    expect(markup).toContain("No completed results yet.");
    expect(markup).not.toContain("View score history");
    expect(markup).not.toMatch(/response|answer|scoring key/i);
  });

  it("keeps unpublished drafts visible but unavailable for assignment", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [{ ...assessment, publishedVersionId: null, schedule: null, partners: [] }],
      sessions: [], preferences: {}, canReadResults: true, canManageSchedule: true, canManagePreference: true, activeCaseSessionId: null,
    }));
    expect(markup).toContain("No published version is available yet");
    expect(markup).not.toContain("Assign Assessment");
  });

  it("supports multiple assessments and optional scheduling without Love Languages-specific UI assumptions", () => {
    const second: CounselorAssessment = {
      ...assessment,
      id: "assessment-2",
      title: "Communication Styles",
      schedule: { ...assessment.schedule!, id: "schedule-2", requiredForProgression: false, source: "case_override" },
    };
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment, second], sessions: [{ id: "session-1", title: "Foundations", sequenceNumber: 1 }],
      preferences: {}, canReadResults: true, canManageSchedule: false, canManagePreference: false, activeCaseSessionId: null,
    }));
    expect(markup).toContain("Love Languages");
    expect(markup).toContain("Communication Styles");
    expect(markup).toContain("Required");
    expect(markup).toContain("Optional");
    expect(markup.match(/View Results/g)).toHaveLength(2);
  });

  it("keeps each visible scheduling form associated with its assessment", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment, { ...assessment, id: "assessment-2", title: "Communication Styles" }],
      sessions: [{ id: "session-1", title: "Foundations", sequenceNumber: 1 }], preferences: {},
      canReadResults: false, canManageSchedule: true, canManagePreference: true, activeCaseSessionId: null,
    }));
    expect(markup).toContain('id="assessment-session-assessment-1"');
    expect(markup).toContain('id="assessment-default-assessment-1"');
    expect(markup).toContain('id="assessment-session-assessment-2"');
    expect(markup).toContain('id="assessment-default-assessment-2"');
  });

  it("does not expose participant results to Admin-only viewers", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment], sessions: [], preferences: {},
      canReadResults: false, canManageSchedule: false, canManagePreference: false, activeCaseSessionId: "case-session-1",
    }));
    expect(markup).toContain("Partner completion status and results are unavailable in this view.");
    expect(markup).not.toContain("submitted</span>");
    expect(markup).not.toContain("View Results");
    expect(markup).not.toContain("Alex A");
    expect(markup).not.toContain("Words");
  });

  it("shows authorized staff a results dialog without exposing scheduling controls or score history", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment], sessions: [], preferences: {},
      canReadResults: true, canManageSchedule: false, canManagePreference: false, activeCaseSessionId: null,
    }));
    expect(markup).toContain("Alex A");
    expect(markup).toContain("Blake B");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("Words");
    expect(markup).toContain("12</span>");
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Partner submission status and available scores.");
    expect(markup).not.toContain("View score history");
    expect(markup).not.toContain("Assign Assessment");
    expect(markup).not.toContain("My default for future Cases");
    expect(markup).not.toContain("/ 12");
    expect(markup).not.toMatch(/response|answer|scoring key/i);
  });
});
