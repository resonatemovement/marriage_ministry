import type { CaseStatus } from "@/lib/counseling/domain";

type MetricTone = "blue" | "amber" | "green" | "coral";

export interface DashboardMetric {
  label: string;
  value: number | null;
  detail: string;
  href: string | null;
  valueLabel: string;
  tone: MetricTone;
}

export interface DashboardCounts {
  unassignedCouples: number;
  activeCouples: number;
  underReviewIntakes: number;
  completedCouples: number;
  currentCases: number;
  workflow: readonly { status: CaseStatus; label: string; count: number }[];
}

export type DashboardProgression = {
  stages: readonly { id: string; label: string; valueLabel: string; count: number; href: string | null }[];
  intakeReferralCount: number;
  sessions: readonly { id: string; number: number | null; title: string; count: number; href: string | null }[];
  unclassifiedCount: number;
};

export type DashboardAttentionItem = {
  id: string;
  category: "Intake Request" | "Unassigned Couple";
  title: string;
  detail: string;
  href: string;
};

export function dedupeDashboardAttentionItems(items: readonly DashboardAttentionItem[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

type DashboardAlert = {
  requestId: string;
  campusName: string;
  alertType: string;
  elapsedHours: number;
  incompletePartners: readonly { firstName: string; lastName: string }[];
};

const alertTitles: Readonly<Record<string, string>> = {
  new_ready_for_review: "New Intake Request",
  stalled_ready_for_review: "Ready for Review · Stalled",
  stalled_under_review: "Under Review · Stalled",
  stalled_ready_to_invite: "Ready to Invite · Stalled",
  incomplete_onboarding: "Invitation · Onboarding incomplete",
};

export function intakeAttentionItems(alerts: readonly DashboardAlert[]): DashboardAttentionItem[] {
  return dedupeDashboardAttentionItems(alerts.flatMap((alert) => {
    const title = alertTitles[alert.alertType];
    if (!title) return [];
    const incomplete = alert.incompletePartners.map(({ firstName, lastName }) => `${firstName} ${lastName}`).join(", ");
    const elapsedHours = Math.max(0, Math.floor(alert.elapsedHours));
    return [{ id: `intake:${alert.requestId}:${alert.alertType}`, category: "Intake Request", title, detail: `${alert.campusName} · ${incomplete || `${elapsedHours} hours elapsed`}`, href: `/intake-requests/${alert.requestId}` }];
  }));
}

export function dashboardCoupleListHref(caseStatus: CaseStatus | "unassigned") {
  return `/people?filter=couples&caseStatus=${caseStatus}`;
}

export function dashboardProgressionHref(stage: string) {
  return `/people?filter=couples&workflowStage=${encodeURIComponent(stage)}`;
}

export function dashboardSessionHref(sessionId: string) {
  return `/people?filter=couples&workflowSession=${encodeURIComponent(sessionId)}`;
}

const workflowLabels: readonly { status: CaseStatus; label: string }[] = [
  { status: "requested", label: "Requested" },
  { status: "assessment", label: "Assessment" },
  { status: "interviewed", label: "Interviewed" },
  { status: "matched", label: "Matched" },
  { status: "active", label: "Active" },
  { status: "finished", label: "Finished" },
  { status: "referred", label: "Referred" },
  { status: "inactive", label: "Closed — Incomplete" },
];

export type DashboardCase = {
  couple_group_id: string;
  status: CaseStatus;
  case_assignments: readonly { assignment_type: string; ended_at: string | null }[] | null;
};

export function canReadAdminDashboard(roles: readonly string[]) {
  return roles.includes("admin") || roles.includes("super_admin");
}

export function canReadSharedDashboard(roles: readonly string[]) {
  return canReadAdminDashboard(roles) || roles.includes("campus_lead");
}

/** Counts each active Couple once, using its unique current Case and active Counselor-of-record assignment. */
export function calculateDashboardCounts(activeCoupleGroupIds: readonly string[], cases: readonly DashboardCase[], underReviewIntakes = 0): DashboardCounts {
  const coupleIds = new Set(activeCoupleGroupIds);
  const currentCaseByCouple = new Map<string, DashboardCase>();
  for (const counselingCase of cases) {
    if (coupleIds.has(counselingCase.couple_group_id)) currentCaseByCouple.set(counselingCase.couple_group_id, counselingCase);
  }

  const statusCounts = new Map<CaseStatus, number>([...workflowLabels, { status: "pending_final" as const, label: "Pending final" }].map(({ status }) => [status, 0]));
  currentCaseByCouple.forEach((counselingCase) => {
    statusCounts.set(counselingCase.status, (statusCounts.get(counselingCase.status) ?? 0) + 1);
  });

  const unassignedCouples = [...coupleIds].filter((coupleId) => {
    const assignments = currentCaseByCouple.get(coupleId)?.case_assignments ?? [];
    return !assignments.some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null);
  }).length;
  const workflow = workflowLabels.map(({ status, label }) => ({ status, label, count: statusCounts.get(status) ?? 0 }));

  return {
    unassignedCouples,
    activeCouples: statusCounts.get("active") ?? 0,
    underReviewIntakes,
    completedCouples: statusCounts.get("finished") ?? 0,
    currentCases: currentCaseByCouple.size,
    workflow,
  };
}

export function dashboardMetrics(counts: DashboardCounts | null, canNavigateCouples = true, underReviewHref: string | null = "/intake-requests?status=under_review"): readonly DashboardMetric[] {
  return [
    { label: "Unassigned Couples", value: counts?.unassignedCouples ?? null, valueLabel: "couples", detail: "No active Counselor-of-record assignment", href: canNavigateCouples ? dashboardCoupleListHref("unassigned") : null, tone: "amber" },
    { label: "Active Couples", value: counts?.activeCouples ?? null, valueLabel: "couples", detail: "Current Case status: Active", href: canNavigateCouples ? dashboardCoupleListHref("active") : null, tone: "blue" },
    { label: "Under Review Intakes", value: counts?.underReviewIntakes ?? null, valueLabel: "Intake Requests", detail: "Current Intake Request status: Under Review", href: underReviewHref, tone: "coral" },
    { label: "Completed Couples", value: counts?.completedCouples ?? null, valueLabel: "couples", detail: "Current Case status: Finished", href: canNavigateCouples ? dashboardCoupleListHref("finished") : null, tone: "green" },
  ];
}

export function dashboardWorkflow(counts: DashboardCounts | null) {
  return counts?.workflow ?? workflowLabels.map(({ status, label }) => ({ status, label, count: null }));
}
