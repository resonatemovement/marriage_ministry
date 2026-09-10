import type { IntakeRequestStatus } from "./model";

export const CLOSE_REASONS = [
  ["couple_withdrew", "Couple withdrew"],
  ["professional_referral", "Referred to professional"],
  ["not_appropriate", "Not appropriate"],
  ["duplicate_request", "Duplicate"],
  ["unable_to_contact", "Unable to contact"],
  ["other", "Other"],
] as const;

export type IntakeRequestAction = "start_review" | "send_invite" | "close" | "reopen";
type IntakeCloseReason = (typeof CLOSE_REASONS)[number][0];

const ACTIONS: Readonly<Record<IntakeRequestStatus, readonly IntakeRequestAction[]>> = {
  ready_for_review: ["start_review", "close"],
  under_review: ["send_invite", "close"],
  ready_to_invite: [],
  invited: [],
  closed: ["reopen"],
};

export function intakeRequestActions(status: IntakeRequestStatus) { return ACTIONS[status]; }
export function isIntakeRequestAction(value: string): value is IntakeRequestAction { return ["start_review", "send_invite", "close", "reopen"].includes(value); }
export function isIntakeCloseReason(value: string): value is IntakeCloseReason { return CLOSE_REASONS.some(([code]) => code === value); }
export function intakeActionLabel(action: IntakeRequestAction) {
  return ({ start_review: "Start Review", send_invite: "Send Invite", close: "Close Request", reopen: "Reopen for Review" })[action];
}
