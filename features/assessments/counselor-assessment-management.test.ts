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

import { AssessmentResultsContent, CounselorAssessmentCards, CounselorAssessmentSchedulingSettings } from "./counselor-assessment-management";
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
  it("keeps the compact summary card separate from scheduling settings", () => {
    const scheduling = renderToStaticMarkup(createElement(CounselorAssessmentSchedulingSettings, {
      caseId: "case-1", assessments: [assessment], sessions: [{ id: "session-1", title: "Foundations", sequenceNumber: 1 }],
      preferences: {}, canManageSchedule: true, canManagePreference: true,
    }));
    const cards = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment],
      canReadResults: true, activeCaseSessionId: "case-session-1",
    }));
    expect(scheduling).toContain("Scheduling Settings");
    expect(scheduling).toContain("Case Session");
    expect(scheduling).toContain("My default for future Cases");
    expect(scheduling).toContain("Existing Case schedules stay unchanged.");
    expect(cards).toContain('aria-label="Assessments"');
    expect(cards).not.toContain("Session 1: Foundations");
    expect(cards).not.toContain("Not scheduled");
    expect(cards).toContain("1 of 2 submitted");
    expect(cards).toContain("Blocking Session advancement");
    expect(cards).toContain("Alex A");
    expect(cards).toContain("Words, Time");
    expect(cards).toContain("Submitted");
    expect(cards).toContain("In Progress");
    expect(cards).toContain("1 of 2 submitted");
    expect(cards).toContain("View Results");
    expect(cards).toContain("text-brand-primary underline-offset-4");
    const resultsTrigger = cards.match(/<button[^>]*aria-haspopup="dialog"[^>]*class="([^"]*)"[^>]*>View Results<\/button>/)?.[1] ?? "";
    expect(resultsTrigger).toContain("inline-flex w-fit items-center");
    expect(resultsTrigger).not.toContain("min-h-10");
    expect(resultsTrigger).not.toMatch(/\bp[xytrbl]?-\d/);
    expect(cards).not.toContain("bg-brand-primary px-4");
    expect(cards).toContain('aria-label="Love Languages participant progress"');
    expect(cards).toContain("Alex A");
    expect(cards).not.toContain("sm:grid-cols-2");
    expect(cards).not.toContain("Scheduling Settings");
    expect(cards).not.toContain("Case Session");
    expect(cards).not.toContain("My default for future Cases");
    expect(cards).not.toContain("Save Session");
    expect(cards).not.toContain("View score history");
    expect(cards).not.toMatch(/response|answer|scoring key/i);
  });

  it("keeps only the aggregate submission count when both partners submitted", () => {
    const completed: CounselorAssessment = {
      ...assessment,
      partners: assessment.partners.map((partner) => ({ ...partner, status: "completed" as const })),
    };
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [completed], canReadResults: true, activeCaseSessionId: null,
    }));
    const summary = markup.slice(0, markup.indexOf("View Results"));

    expect(summary).toContain("2 of 2 submitted");
    expect(summary).toContain("Alex A");
    expect(summary).toContain("Blake B");
    expect(summary).not.toContain("Submitted");
    expect(markup).not.toContain("Primary results:");
  });

  it("can omit its section heading when embedded inside the matching Admin tab", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment], canReadResults: true, activeCaseSessionId: null, showHeading: false,
    }));
    expect(markup).toContain('aria-label="Assessments"');
    expect(markup).not.toContain(">Assessments</h3>");
    expect(markup).toContain("Love Languages");
    expect(markup).toContain("View Results");
  });

  it("renders a compact case-rail summary without participant names or individual results", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment], canReadResults: true, activeCaseSessionId: "case-session-1", compactSummary: true,
    }));

    expect(markup).toContain(">Assessments</h3>");
    expect(markup).toContain("Love Languages");
    expect(markup).toContain("Required");
    expect(markup).toContain("1 of 2 submitted");
    expect(markup).toContain("View Results");
    const dialogIndex = markup.indexOf('role="dialog"');
    expect(dialogIndex).toBeGreaterThan(0);
    const summary = markup.slice(0, dialogIndex);
    const resultsDialog = markup.slice(dialogIndex);
    expect(summary).not.toContain("Alex A");
    expect(summary).not.toContain("Blake B");
    expect(summary).not.toContain("Words");
    expect(resultsDialog).toContain("Alex A");
    expect(resultsDialog).toContain("Words");
    expect(markup).not.toContain("Blocking Session advancement");
    expect(markup).not.toContain("participant progress");
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
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentSchedulingSettings, {
      caseId: "case-1", assessments: [{ ...assessment, publishedVersionId: null, schedule: null, partners: [] }],
      sessions: [], preferences: {}, canManageSchedule: true, canManagePreference: true,
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
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment, second],
      canReadResults: true, activeCaseSessionId: null,
    }));
    expect(markup).toContain("Love Languages");
    expect(markup).toContain("Communication Styles");
    expect(markup).toContain("Required");
    expect(markup).toContain("Optional");
    expect(markup.match(/View Results/g)).toHaveLength(2);
    expect(markup).not.toContain("Session 1: Foundations");
  });

  it("shows each partner's primary result in vertically stacked compact rows", () => {
    const bothSubmitted: CounselorAssessment = {
      ...assessment,
      partners: [assessment.partners[0], {
        ...assessment.partners[1],
        status: "completed",
        latestScores: [{ label: "Touch", score: 9, rank: 1, isPrimary: true }],
      }],
    };
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [bothSubmitted], canReadResults: true, activeCaseSessionId: null,
      partnerOrder: [{ id: "profile-b", name: "Blake B", gender: "male" }, { id: "profile-a", name: "Alex A", gender: "female" }],
    }));
    const summary = markup.slice(markup.indexOf('aria-label="Love Languages participant progress"'), markup.indexOf("</ul>", markup.indexOf('aria-label="Love Languages participant progress"')));
    expect(summary.indexOf("Blake B")).toBeLessThan(summary.indexOf("Alex A"));
    expect(summary).toContain("Words, Time");
    expect(summary).toContain("Touch");
    expect(summary.match(/rounded-md bg-surface-muted px-3 py-2 text-sm/g)).toHaveLength(2);
    expect(summary).not.toContain("sm:grid-cols-2");
  });

  it("does not render participant status or results when the view is not authorized to read them", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment], canReadResults: false, activeCaseSessionId: null,
    }));
    expect(markup).toContain("Partner completion status and results are unavailable in this view.");
    expect(markup).not.toContain("Alex A");
    expect(markup).not.toContain("Words");
    expect(markup).not.toContain("View Results");
  });

  it("keeps each visible scheduling form associated with its assessment", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentSchedulingSettings, {
      caseId: "case-1", assessments: [assessment, { ...assessment, id: "assessment-2", title: "Communication Styles" }],
      sessions: [{ id: "session-1", title: "Foundations", sequenceNumber: 1 }], preferences: {},
      canManageSchedule: true, canManagePreference: true,
    }));
    expect(markup).toContain('id="assessment-session-assessment-1"');
    expect(markup).toContain('id="assessment-default-assessment-1"');
    expect(markup).toContain('id="assessment-session-assessment-2"');
    expect(markup).toContain('id="assessment-default-assessment-2"');
  });

  it("does not expose participant results to Admin-only viewers", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment],
      canReadResults: false, activeCaseSessionId: "case-session-1",
    }));
    expect(markup).toContain("Partner completion status and results are unavailable in this view.");
    expect(markup).not.toContain("submitted</span>");
    expect(markup).not.toContain("View Results");
    expect(markup).not.toContain("Alex A");
    expect(markup).not.toContain("Words");
  });

  it("shows authorized staff a results dialog without exposing scheduling controls or score history", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentCards, {
      assessments: [assessment],
      canReadResults: true, activeCaseSessionId: null,
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
