export type CounselorAssessmentScore = { label: string; score: number; rank: number; isPrimary: boolean };
export type CounselorAssessmentHistory = { attemptNumber: number; submittedAt: string; scores: CounselorAssessmentScore[] };
export type CounselorAssessmentPartner = {
  profileId: string;
  name: string;
  status: "not_assigned" | "not_started" | "in_progress" | "completed";
  latestScores: CounselorAssessmentScore[];
  history: CounselorAssessmentHistory[];
};
export type CounselorAssessment = {
  id: string;
  title: string;
  description: string | null;
  publishedVersionId: string | null;
  publishedVersionNumber: number | null;
  systemDefaultSessionId: string | null;
  schedule: { id: string; sessionId: string; caseSessionId: string | null; progressionCaseSessionId: string | null; requiredForProgression: boolean; source: string } | null;
  partners: CounselorAssessmentPartner[];
};
export type CounselorAssessmentSession = { id: string; title: string; sequenceNumber: number };

export type CounselorAssessmentRows = {
  assignments: { id: string; profileId: string; scheduleId?: string }[];
  attempts: { id: string; assignmentId: string; profileId: string; attemptNumber: number; status: "in_progress" | "submitted"; submittedAt: string | null }[];
  scores: { attemptId: string; categoryId: string; score: number; rank: number; isPrimary: boolean }[];
  categories: { id: string; label: string }[];
};

export function projectCounselorAssessmentPartners(
  partners: { id: string; name: string }[],
  rows: CounselorAssessmentRows,
): CounselorAssessmentPartner[] {
  const labels = new Map(rows.categories.map(({ id, label }) => [id, label]));
  const scoresByAttempt = new Map<string, CounselorAssessmentScore[]>();
  for (const score of rows.scores) {
    const label = labels.get(score.categoryId);
    if (!label) continue;
    scoresByAttempt.set(score.attemptId, [...(scoresByAttempt.get(score.attemptId) ?? []), {
      label, score: score.score, rank: score.rank, isPrimary: score.isPrimary,
    }]);
  }

  return partners.map((partner) => {
    const assignment = rows.assignments.find(({ profileId }) => profileId === partner.id);
    if (!assignment) return { profileId: partner.id, name: partner.name, status: "not_assigned", latestScores: [], history: [] };
    const attempts = rows.attempts.filter(({ assignmentId }) => assignmentId === assignment.id);
    const initial = attempts.find(({ attemptNumber }) => attemptNumber === 1);
    const history = attempts.filter((attempt) => attempt.status === "submitted" && attempt.submittedAt)
      .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""))
      .map((attempt) => ({ attemptNumber: attempt.attemptNumber, submittedAt: attempt.submittedAt!, scores: scoresByAttempt.get(attempt.id) ?? [] }));
    return {
      profileId: partner.id,
      name: partner.name,
      status: initial?.status === "submitted" ? "completed" : initial ? "in_progress" : "not_started",
      latestScores: (history[0]?.scores ?? []).sort((left, right) => left.rank - right.rank),
      history,
    };
  });
}

export function assessmentBlocksSessionAdvancement(
  assessment: Pick<CounselorAssessment, "schedule" | "partners">,
  activeCaseSessionId: string | null,
): boolean {
  return Boolean(
    activeCaseSessionId
    && assessment.schedule?.requiredForProgression
    && assessment.schedule.progressionCaseSessionId === activeCaseSessionId
    && assessment.partners.some((partner) => partner.status !== "completed"),
  );
}
