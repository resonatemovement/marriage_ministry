import type { CaseStatus } from "./domain";

export const MINISTRY_PROGRESSION_STAGES = [
  { id: "intake", label: "Intake", valueLabel: "Intake Requests" },
  { id: "onboarding", label: "Onboarding", valueLabel: "couples" },
  { id: "awaiting_assignment", label: "Awaiting Assignment", valueLabel: "couples" },
  { id: "counseling", label: "Counseling", valueLabel: "couples" },
  { id: "completed", label: "Completed", valueLabel: "couples" },
  { id: "referred", label: "Referred", valueLabel: "couples" },
  { id: "closed_incomplete", label: "Closed — Incomplete", valueLabel: "couples" },
] as const;

export type MinistryProgressionStage = (typeof MINISTRY_PROGRESSION_STAGES)[number]["id"];
export type OnboardingStatus = "complete" | "incomplete" | "unknown";

export function coupleOnboardingStatus(memberCompletion: readonly boolean[], coupleInvitationCount: number): OnboardingStatus {
  if (memberCompletion.length === 2) return memberCompletion.every(Boolean) ? "complete" : "incomplete";
  return memberCompletion.length < 2 && coupleInvitationCount === 2 ? "incomplete" : "unknown";
}

export function coupleProgressionStage(input: {
  caseStatus: CaseStatus | null;
  hasCounselorOfRecord: boolean;
  onboarding: OnboardingStatus;
}): Exclude<MinistryProgressionStage, "intake"> | null {
  const { caseStatus, hasCounselorOfRecord, onboarding } = input;
  if (caseStatus === "finished") return "completed";
  if (caseStatus === "referred") return "referred";
  if (caseStatus === "inactive") return "closed_incomplete";
  if (onboarding === "unknown" || (caseStatus && onboarding === "incomplete")) return null;
  if (onboarding === "incomplete") return "onboarding";
  if (!hasCounselorOfRecord) return "awaiting_assignment";
  if (caseStatus === "matched" || caseStatus === "active" || caseStatus === "pending_final") return "counseling";
  return null;
}

export function currentCounselingSessionKey(input: {
  caseStatus: CaseStatus | null;
  hasCounselorOfRecord: boolean;
  activeSessionId: string | null;
  publishedSessionIds: ReadonlySet<string>;
}): string | null {
  if (!input.hasCounselorOfRecord || !["matched", "active", "pending_final"].includes(input.caseStatus ?? "")) return null;
  if (!input.activeSessionId) return "initial";
  return input.publishedSessionIds.has(input.activeSessionId) ? input.activeSessionId : null;
}
