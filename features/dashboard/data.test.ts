import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculateDashboardCounts, canReadAdminDashboard, canReadSharedDashboard, dashboardCoupleListHref, dashboardMetrics, dashboardWorkflow, dedupeDashboardAttentionItems, intakeAttentionItems, type DashboardAttentionItem, type DashboardCase } from "./data";

const activeAssignment = { assignment_type: "counselor", ended_at: null };

function caseRow(couple_group_id: string, status: DashboardCase["status"], case_assignments: DashboardCase["case_assignments"] = []) {
  return { couple_group_id, status, case_assignments } satisfies DashboardCase;
}

describe("Admin dashboard metrics", () => {
  it("returns real zero counts for an empty dataset", () => {
    const counts = calculateDashboardCounts([], []);
    expect(counts).toMatchObject({ unassignedCouples: 0, activeCouples: 0, underReviewIntakes: 0, completedCouples: 0, currentCases: 0 });
    expect(counts.workflow.every(({ count }) => count === 0)).toBe(true);
  });

  it("counts one Couple once and uses only its current assignment and status", () => {
    const counts = calculateDashboardCounts(["couple-1"], [caseRow("couple-1", "active", [activeAssignment])]);
    expect(counts).toMatchObject({ unassignedCouples: 0, activeCouples: 1, completedCouples: 0, currentCases: 1 });
  });

  it("counts multiple unique Couples by their current Case status and Counselor-of-record state", () => {
    const counts = calculateDashboardCounts(
      ["active", "final", "finished", "unassigned", "coach-only", "no-case", "active"],
      [
        caseRow("active", "active", [activeAssignment]),
        caseRow("final", "pending_final", [activeAssignment]),
        caseRow("finished", "finished", [activeAssignment]),
        caseRow("unassigned", "interviewed", [{ assignment_type: "counselor", ended_at: "2026-10-01T00:00:00Z" }]),
        caseRow("coach-only", "assessment", [{ assignment_type: "coach", ended_at: null }]),
        caseRow("outside-active-couples", "active", [activeAssignment]),
      ],
    );
    expect(counts).toMatchObject({ unassignedCouples: 3, activeCouples: 1, completedCouples: 1, currentCases: 5 });
    expect(counts.workflow.reduce((sum, stage) => sum + stage.count, 0)).toBe(4);
    expect(counts.workflow.some(({ status }) => status === "pending_final")).toBe(false);
  });

  it("uses the current row when a Case changes lifecycle status instead of accumulating history", () => {
    const finished = calculateDashboardCounts(["couple"], [caseRow("couple", "finished", [activeAssignment])]);
    const reopened = calculateDashboardCounts(["couple"], [caseRow("couple", "active", [activeAssignment])]);
    expect(finished).toMatchObject({ completedCouples: 1, activeCouples: 0, currentCases: 1 });
    expect(reopened).toMatchObject({ completedCouples: 0, activeCouples: 1, currentCases: 1 });
  });

  it("relies on the schema's one-Case-per-Couple constraint, not historical status rows", () => {
    const migration = readFileSync("supabase/migrations/20260818090000_core_counseling_domain.sql", "utf8");
    expect(migration).toMatch(/couple_group_id\s+uuid\s+not null unique references public\.groups\(id\)/i);
    expect(migration).toContain("create table public.case_status_history");
  });

  it("authorizes Admin and Super Admin dashboard reads only", () => {
    expect(canReadAdminDashboard(["admin"])).toBe(true);
    expect(canReadAdminDashboard(["super_admin"])).toBe(true);
    expect(canReadAdminDashboard(["coach", "couple"])).toBe(false);
  });

  it("does not supply fabricated metric or workflow values when live data is unavailable", () => {
    expect(dashboardMetrics(null).every(({ value }) => value === null)).toBe(true);
    expect(dashboardWorkflow(null).every(({ count }) => count === null)).toBe(true);
  });

  it("routes the four metric cards to the matching Couple filters", () => {
    const counts = calculateDashboardCounts([], []);
    expect(dashboardMetrics(counts).map(({ href }) => href)).toEqual([
      "/people?filter=couples&caseStatus=unassigned",
      "/people?filter=couples&caseStatus=active",
      "/intake-requests?status=under_review",
      "/people?filter=couples&caseStatus=finished",
    ]);
  });

  it("builds destinations for the visible workflow stages without Pending Final", () => {
    expect(dashboardWorkflow(calculateDashboardCounts([], [])).map(({ status }) => dashboardCoupleListHref(status))).toEqual([
      "requested", "assessment", "interviewed", "matched", "active", "finished", "referred", "inactive",
    ].map((status) => `/people?filter=couples&caseStatus=${status}`));
  });

  it("lets Campus Leads read the shared dashboard without granting Admin access", () => {
    expect(canReadSharedDashboard(["campus_lead"])).toBe(true);
    expect(canReadAdminDashboard(["campus_lead"])).toBe(false);
    expect(dashboardMetrics(calculateDashboardCounts([], []), false).map(({ href }) => href)).toEqual([null, null, "/intake-requests?status=under_review", null]);
    const metrics = dashboardMetrics(calculateDashboardCounts([], [], 3));
    expect(metrics[2]).toMatchObject({ label: "Under Review Intakes", value: 3, valueLabel: "Intake Requests" });
  });

  it("deduplicates the same actionable request/couple item without collapsing distinct actions", () => {
    const intake = { id: "intake:request:stalled_under_review", category: "Intake Request", title: "Under Review · Stalled", detail: "Fremont", href: "/intake-requests/request" } satisfies DashboardAttentionItem;
    const couple = { id: "couple:group", category: "Unassigned Couple", title: "Alex & Jordan", detail: "Unassigned · Fremont · No Case", href: "/people/team" } satisfies DashboardAttentionItem;
    expect(dedupeDashboardAttentionItems([intake, intake, couple])).toEqual([intake, couple]);
    expect(dedupeDashboardAttentionItems([])).toEqual([]);
  });

  it("turns only currently returned alert actions into unique Attention items", () => {
    const alert = { requestId: "request-1", campusName: "Fremont", elapsedHours: 50, incompletePartners: [{ firstName: "Alex", lastName: "Lee" }] };
    const result = intakeAttentionItems([
      { ...alert, alertType: "new_ready_for_review", incompletePartners: [] },
      { ...alert, alertType: "stalled_ready_for_review" },
      { ...alert, alertType: "stalled_ready_for_review" },
      { ...alert, alertType: "stalled_under_review" },
      { ...alert, alertType: "stalled_ready_to_invite" },
      { ...alert, alertType: "incomplete_onboarding" },
      { ...alert, alertType: "closed" },
    ]);
    expect(result.map(({ title }) => title)).toEqual([
      "New Intake Request", "Ready for Review · Stalled", "Under Review · Stalled",
      "Ready to Invite · Stalled", "Invitation · Onboarding incomplete",
    ]);
    expect(result.find(({ title }) => title === "Invitation · Onboarding incomplete")?.detail).toContain("Alex Lee");
    expect(intakeAttentionItems([])).toEqual([]);
  });

  it("documents the Campus Lead aggregate RPC as identity-free and scope-checked", () => {
    const migration = readFileSync("supabase/migrations/20261105110000_campus_lead_dashboard_aggregates.sql", "utf8");
    expect(migration).toContain("security definer");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("campus_lead_assignments");
    expect(migration).toContain("campus.active");
    expect(migration).toContain("group_type = 'couple'");
    expect(migration).not.toContain("first_name");
    expect(migration).not.toContain("group_name");
    expect(migration).toContain("revoke all on function public.get_campus_lead_dashboard_metrics() from public, anon, authenticated");
  });
});
