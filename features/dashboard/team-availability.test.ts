import { describe, expect, it } from "vitest";
import { filterDashboardAvailabilityTeams, mapDashboardAvailabilityTeams, normalizeTeamAvailabilityView, teamAvailabilityDetailHref, teamAvailabilityListHref, teamCoupleCountLabel, validateTeamAvailabilityReturnTo, wrapTeamAvailabilityIndex } from "./team-availability";

const teams = mapDashboardAvailabilityTeams([
  { team_id: "coach-2", team_name: "B Coach", team_type: "coach_team", campus_name: "Oakland", accepting_new_couples: true, couple_count: 2 },
  { team_id: "lead-1", team_name: "A Campus Leads", team_type: "campus_lead_team", campus_name: "Fremont", accepting_new_couples: true, couple_count: 0 },
  { team_id: "counselor-1", team_name: "C Counselors", team_type: "counselor_team", campus_name: "Fremont", accepting_new_couples: false, couple_count: 1 },
  { team_id: "broken", team_name: "Invalid", team_type: "unknown", accepting_new_couples: true, couple_count: 0 },
]);

describe("Dashboard Team Availability", () => {
  it("maps active supported team types and sorts by direct Couple count with stable name ties", () => {
    expect(teams.map(({ id }) => id)).toEqual(["lead-1", "counselor-1", "coach-2"]);
    expect(teams[0]).toMatchObject({ role: "Campus Lead", coupleCount: 0 });
  });

  it("defaults to accepting teams with zero directly assigned Couples and supports All Teams", () => {
    expect(filterDashboardAvailabilityTeams(teams, "available").map(({ id }) => id)).toEqual(["lead-1"]);
    expect(filterDashboardAvailabilityTeams(teams, "all").map(({ id }) => id)).toEqual(["lead-1", "counselor-1", "coach-2"]);
  });

  it("searches team, role, and campus without changing the current view", () => {
    expect(filterDashboardAvailabilityTeams(teams, "all", "oakland").map(({ id }) => id)).toEqual(["coach-2"]);
    expect(filterDashboardAvailabilityTeams(teams, "all", "counselor").map(({ id }) => id)).toEqual(["counselor-1"]);
  });

  it.each([[0, "0 Couples"], [1, "1 Couple"], [2, "2 Couples"]] as const)("pluralizes %i Couple(s)", (count, label) => {
    expect(teamCoupleCountLabel(count)).toBe(label);
  });

  it("preserves list filters in the existing team detail route and validates return destinations", () => {
    const list = teamAvailabilityListHref("all", "Fremont team");
    expect(list).toBe("/dashboard/team-availability?view=all&q=Fremont+team");
    expect(teamAvailabilityDetailHref("team/id", "all", "Fremont team")).toContain(`returnTo=${encodeURIComponent(list)}`);
    expect(validateTeamAvailabilityReturnTo(list)).toBe(list);
    expect(validateTeamAvailabilityReturnTo("https://example.com/?next=/dashboard")).toBe("/dashboard/team-availability");
    expect(validateTeamAvailabilityReturnTo("/dashboard/team-availability?view=all&next=https://example.com")).toBe("/dashboard/team-availability?view=all");
  });

  it("normalizes unknown views to the safe default filter", () => {
    expect(normalizeTeamAvailabilityView(undefined)).toBe("available");
    expect(normalizeTeamAvailabilityView("all")).toBe("all");
    expect(normalizeTeamAvailabilityView("unavailable")).toBe("available");
  });

  it("wraps carousel navigation in both directions and keeps an empty list at zero", () => {
    expect(wrapTeamAvailabilityIndex(0, -1, 2)).toBe(1);
    expect(wrapTeamAvailabilityIndex(1, 1, 2)).toBe(0);
    expect(wrapTeamAvailabilityIndex(0, 1, 1)).toBe(0);
    expect(wrapTeamAvailabilityIndex(0, -1, 0)).toBe(0);
  });
});
