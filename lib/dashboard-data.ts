import type { CaseStatus } from "./domain";

export type MetricTone = "navy" | "blue" | "amber" | "green" | "coral";

export interface DashboardMetric {
  label: string;
  value: number;
  detail: string;
  href: string;
  tone: MetricTone;
}

interface AttentionItem {
  couple: string;
  detail: string;
  urgency: "Today" | "This week";
}

interface UpcomingItem {
  date: string;
  title: string;
  detail: string;
}

export const dashboardMetrics: readonly DashboardMetric[] = [
  { label: "Unassigned couples", value: 6, detail: "2 ready to match", href: "#unassigned", tone: "amber" },
  { label: "Active couples", value: 24, detail: "+3 this month", href: "#workflow", tone: "blue" },
  { label: "Pending final", value: 4, detail: "1 overdue", href: "#attention", tone: "coral" },
  { label: "Completed couples", value: 38, detail: "12 this quarter", href: "#workflow", tone: "green" },
];

export const teamCapacity = [
  { label: "Available Coaches", available: 5, total: 8, tone: "blue" as const },
  { label: "Available Counselors", available: 9, total: 14, tone: "green" as const },
].map((team) => ({
  ...team,
  percentage: Math.round((team.available / team.total) * 100),
}));

export const attentionItems: readonly AttentionItem[] = [
  { couple: "Maya & Jordan", detail: "Assessment review has been waiting 4 days", urgency: "Today" },
  { couple: "Elena & Marcus", detail: "Ready for counselor assignment", urgency: "Today" },
  { couple: "Naomi & David", detail: "Final review needs an Admin decision", urgency: "This week" },
];

export const upcomingItems: readonly UpcomingItem[] = [
  { date: "AUG 19", title: "Intake review", detail: "3 new counseling requests" },
  { date: "AUG 21", title: "Assignment check-in", detail: "Coach and counselor capacity" },
  { date: "AUG 25", title: "Final review", detail: "4 couples pending completion" },
];

export const workflow: readonly { status: CaseStatus; label: string; count: number }[] = [
  { status: "requested", label: "Requested", count: 3 },
  { status: "assessment", label: "Assessment", count: 5 },
  { status: "interviewed", label: "Interviewed", count: 2 },
  { status: "matched", label: "Matched", count: 6 },
  { status: "active", label: "Active", count: 24 },
  { status: "pending_final", label: "Pending final", count: 4 },
  { status: "finished", label: "Finished", count: 38 },
];
