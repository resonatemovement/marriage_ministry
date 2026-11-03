export type CoupleAssessmentStatus = "not_started" | "in_progress" | "completed" | "unavailable";

export type CoupleAssessmentQuestion = {
  id: string;
  position: number;
  prompt: string;
  choices: { id: string; position: number; label: string }[];
};

export type CoupleAssessmentResult = { label: string; score: number; rank: number; isPrimary: boolean };
export type CoupleAssessmentHistoryItem = { attemptNumber: number; submittedAt: string; results: CoupleAssessmentResult[] };
export type CoupleAssessmentPartnerResults = { name: string; submittedAt: string; results: CoupleAssessmentResult[] };

export type CoupleAssessmentNavigation = { questionIndex: number; review: boolean; openedFromReview: boolean };
export type CoupleAssessmentNavigationAction =
  | { type: "open-review-question"; questionIndex: number }
  | { type: "return-to-review" }
  | { type: "show-review" }
  | { type: "go-to-question"; questionIndex: number }
  | { type: "resume"; questionIndex: number };

export function coupleAssessmentNavigationReducer(state: CoupleAssessmentNavigation, action: CoupleAssessmentNavigationAction): CoupleAssessmentNavigation {
  switch (action.type) {
    case "open-review-question":
      return { questionIndex: action.questionIndex, review: false, openedFromReview: true };
    case "return-to-review":
      return { ...state, review: true, openedFromReview: false };
    case "show-review":
      return { ...state, review: true };
    case "go-to-question":
      return { ...state, questionIndex: action.questionIndex };
    case "resume":
      return { questionIndex: action.questionIndex, review: false, openedFromReview: false };
  }
}

export function assessmentStatus(attempt: { status: string } | null, hasQuestions: boolean): CoupleAssessmentStatus {
  if (!hasQuestions) return "unavailable";
  if (!attempt) return "not_started";
  return attempt.status === "submitted" ? "completed" : "in_progress";
}

export function assessmentResultsAreAvailable(status: CoupleAssessmentStatus, attemptId: string | null, submittedLocally: boolean): boolean {
  return submittedLocally || (status === "completed" && !attemptId);
}

export function assessmentResumeIndex(questions: CoupleAssessmentQuestion[], answers: Record<string, string>): number {
  const lastAnswered = questions.reduce((last, question, index) => answers[question.id] ? index : last, -1);
  return Math.min(lastAnswered + 1, Math.max(questions.length - 1, 0));
}

export function nextAssessmentQuestionIndex(currentIndex: number, questionCount: number): number {
  return Math.min(Math.max(currentIndex + 1, 0), Math.max(questionCount - 1, 0));
}

export function previousAssessmentQuestionIndex(currentIndex: number, questionCount: number): number {
  return Math.max(Math.min(currentIndex - 1, Math.max(questionCount - 1, 0)), 0);
}

export function assessmentResultsInDisplayOrder(results: CoupleAssessmentResult[]): CoupleAssessmentResult[] {
  return [...results].sort((a, b) => b.score - a.score || a.rank - b.rank || a.label.localeCompare(b.label));
}

export function assessmentCanSubmit(questions: CoupleAssessmentQuestion[], answers: Record<string, string>, saving: boolean, submitting: boolean) {
  return !saving && !submitting && questions.length > 0 && questions.every((question) => Boolean(answers[question.id]));
}
