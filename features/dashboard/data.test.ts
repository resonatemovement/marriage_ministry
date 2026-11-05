import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculateDashboardCounts, canReadAdminDashboard, dashboardMetrics, dashboardWorkflow, type DashboardCase } from "./data";

const activeAssignment = { assignment_type: "counselor", ended_at: null };

function caseRow(couple_group_id: string, status: DashboardCase["status"], case_assignments: DashboardCase["case_assignments"] = []) {
  return { couple_group_id, status, case_assignments } satisfies DashboardCase;
}

describe("Admin dashboard metrics", () => {
  it("returns real zero counts for an empty dataset", () => {
    const counts = calculateDashboardCounts([], []);
    expect(counts).toMatchObject({ unassignedCouples: 0, activeCouples: 0, pendingFinalCouples: 0, completedCouples: 0, currentCases: 0 });
    expect(counts.workflow.every(({ count }) => count === 0)).toBe(true);
  });

  it("counts one Couple once and uses only its current assignment and status", () => {
    const counts = calculateDashboardCounts(["couple-1"], [caseRow("couple-1", "active", [activeAssignment])]);
    expect(counts).toMatchObject({ unassignedCouples: 0, activeCouples: 1, pendingFinalCouples: 0, completedCouples: 0, currentCases: 1 });
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
    expect(counts).toMatchObject({ unassignedCouples: 3, activeCouples: 1, pendingFinalCouples: 1, completedCouples: 1, currentCases: 5 });
    expect(counts.workflow.reduce((sum, stage) => sum + stage.count, 0)).toBe(5);
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
});
