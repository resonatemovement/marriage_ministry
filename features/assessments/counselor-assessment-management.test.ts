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
vi.mock("./counselor-management-actions", () => ({ saveCaseAssessmentSchedule: vi.fn(), saveCounselorAssessmentPreference: vi.fn() }));

import { CounselorAssessmentManagement } from "./counselor-assessment-management";
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
  it("shows independent partner status, latest tied-primary scores, history, and the progression gate without answer content", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment], sessions: [{ id: "session-1", title: "Foundations", sequenceNumber: 1 }],
      preferences: {}, canReadResults: true, canManagePreference: true, activeCaseSessionId: "case-session-1",
    }));
    expect(markup).toContain("Assessments");
    expect(markup).toContain("Alex A");
    expect(markup).toContain("Blake B");
    expect(markup).toContain("Submitted");
    expect(markup).toContain("In Progress");
    expect(markup.match(/Primary/g)).toHaveLength(4);
    expect(markup).toContain("This Assessment is blocking Session advancement");
    expect(markup).toContain("View score history (1)");
    expect(markup).toContain("My default for future Cases");
    expect(markup).toContain("Existing Case schedules stay unchanged.");
    expect(markup).not.toMatch(/response|answer|scoring key/i);
  });

  it("keeps unpublished drafts visible but unavailable for assignment", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [{ ...assessment, publishedVersionId: null, schedule: null, partners: [] }],
      sessions: [], preferences: {}, canReadResults: true, canManagePreference: true, activeCaseSessionId: null,
    }));
    expect(markup).toContain("No published version is available yet");
    expect(markup).not.toContain("Assign Assessment");
  });

  it("does not expose participant results to Admin-only viewers", () => {
    const markup = renderToStaticMarkup(createElement(CounselorAssessmentManagement, {
      caseId: "case-1", assessments: [assessment], sessions: [], preferences: {},
      canReadResults: false, canManagePreference: false, activeCaseSessionId: "case-session-1",
    }));
    expect(markup).toContain("Partner completion status and results are available only to the assigned Counselor.");
    expect(markup).not.toContain("Alex A");
    expect(markup).not.toContain("Words");
  });
});
