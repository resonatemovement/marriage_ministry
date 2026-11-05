import type { CaseStatus } from "@/lib/counseling/domain";

type MetricTone = "blue" | "amber" | "green" | "coral";

export interface DashboardMetric {
  label: string;
  value: number | null;
  detail: string;
  href: string;
  tone: MetricTone;
}

export interface DashboardCounts {
  unassignedCouples: number;
  activeCouples: number;
  pendingFinalCouples: number;
  completedCouples: number;
  currentCases: number;
  workflow: readonly { status: CaseStatus; label: string; count: number }[];
}

export function dashboardCoupleListHref(caseStatus: CaseStatus | "unassigned") {
  return `/people?filter=couples&caseStatus=${caseStatus}`;
}

const workflowLabels: readonly { status: CaseStatus; label: string }[] = [
  { status: "requested", label: "Requested" },
  { status: "assessment", label: "Assessment" },
  { status: "interviewed", label: "Interviewed" },
  { status: "matched", label: "Matched" },
  { status: "active", label: "Active" },
  { status: "pending_final", label: "Pending final" },
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

/** Counts each active Couple once, using its unique current Case and active Counselor-of-record assignment. */
export function calculateDashboardCounts(activeCoupleGroupIds: readonly string[], cases: readonly DashboardCase[]): DashboardCounts {
  const coupleIds = new Set(activeCoupleGroupIds);
  const currentCaseByCouple = new Map<string, DashboardCase>();
  for (const counselingCase of cases) {
    if (coupleIds.has(counselingCase.couple_group_id)) currentCaseByCouple.set(counselingCase.couple_group_id, counselingCase);
  }

  const statusCounts = new Map<CaseStatus, number>(workflowLabels.map(({ status }) => [status, 0]));
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
    pendingFinalCouples: statusCounts.get("pending_final") ?? 0,
    completedCouples: statusCounts.get("finished") ?? 0,
    currentCases: currentCaseByCouple.size,
    workflow,
  };
}

export function dashboardMetrics(counts: DashboardCounts | null): readonly DashboardMetric[] {
  return [
    { label: "Unassigned couples", value: counts?.unassignedCouples ?? null, detail: "No active Counselor-of-record assignment", href: dashboardCoupleListHref("unassigned"), tone: "amber" },
    { label: "Active couples", value: counts?.activeCouples ?? null, detail: "Current Case status: Active", href: dashboardCoupleListHref("active"), tone: "blue" },
    { label: "Pending final", value: counts?.pendingFinalCouples ?? null, detail: "Current Case status: Pending final", href: dashboardCoupleListHref("pending_final"), tone: "coral" },
    { label: "Completed couples", value: counts?.completedCouples ?? null, detail: "Current Case status: Finished", href: dashboardCoupleListHref("finished"), tone: "green" },
  ];
}

export function dashboardWorkflow(counts: DashboardCounts | null) {
  return counts?.workflow ?? workflowLabels.map(({ status, label }) => ({ status, label, count: null }));
}
