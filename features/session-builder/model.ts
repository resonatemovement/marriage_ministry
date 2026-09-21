export const SESSION_STATUSES = ["draft", "published", "archived"] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionLifecycleAction = "archive" | "restore";

const SESSION_LIFECYCLE_ACTIONS = ["archive", "restore"] as const;

const lifecycleTransitions: Record<SessionLifecycleAction, { from: readonly SessionStatus[]; to: SessionStatus }> = {
  archive: { from: ["draft", "published"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};

const labels: Record<SessionStatus, string> = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export function isSessionStatus(value: string | undefined): value is SessionStatus {
  return SESSION_STATUSES.includes(value as SessionStatus);
}

export function isSessionLifecycleAction(value: string): value is SessionLifecycleAction {
  return SESSION_LIFECYCLE_ACTIONS.includes(value as SessionLifecycleAction);
}

export function sessionStatusLabel(status: SessionStatus) {
  return labels[status];
}

export function normalizeSessionTitle(value: string) {
  return value.trim();
}

export function sessionLifecycleTarget(status: SessionStatus, action: SessionLifecycleAction): SessionStatus | null {
  const transition = lifecycleTransitions[action];
  return transition.from.includes(status) ? transition.to : null;
}

export function sessionLifecycleTransition(action: SessionLifecycleAction) {
  return lifecycleTransitions[action];
}
