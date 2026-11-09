export type TeamAvailabilityView = "available" | "all";

export type DashboardAvailabilityTeam = {
  id: string;
  name: string;
  role: "Campus Lead" | "Coach" | "Counselor";
  campus: string | null;
  acceptingNewCouples: boolean;
  coupleCount: number;
};

type AvailabilityRpcRow = {
  team_id?: unknown;
  team_name?: unknown;
  team_type?: unknown;
  campus_name?: unknown;
  accepting_new_couples?: unknown;
  couple_count?: unknown;
};

const roleLabels: Readonly<Record<string, DashboardAvailabilityTeam["role"]>> = {
  campus_lead_team: "Campus Lead",
  coach_team: "Coach",
  counselor_team: "Counselor",
};

export function mapDashboardAvailabilityTeams(rows: readonly AvailabilityRpcRow[]): DashboardAvailabilityTeam[] {
  return rows.flatMap((row) => {
    const role = typeof row.team_type === "string" ? roleLabels[row.team_type] : undefined;
    if (typeof row.team_id !== "string" || typeof row.team_name !== "string" || !role || typeof row.accepting_new_couples !== "boolean" || typeof row.couple_count !== "number" || !Number.isInteger(row.couple_count) || row.couple_count < 0) return [];
    return [{
      id: row.team_id,
      name: row.team_name,
      role,
      campus: typeof row.campus_name === "string" ? row.campus_name : null,
      acceptingNewCouples: row.accepting_new_couples,
      coupleCount: row.couple_count,
    }];
  }).sort((left, right) => left.coupleCount - right.coupleCount || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

export function filterDashboardAvailabilityTeams(teams: readonly DashboardAvailabilityTeam[], view: TeamAvailabilityView, search = "") {
  const query = search.trim().toLocaleLowerCase();
  return teams.filter((team) => (view === "all" || (team.acceptingNewCouples && team.coupleCount === 0))
    && (!query || [team.name, team.role, team.campus ?? ""].some((value) => value.toLocaleLowerCase().includes(query))));
}

export function teamCoupleCountLabel(count: number) {
  return `${count} ${count === 1 ? "Couple" : "Couples"}`;
}

export function wrapTeamAvailabilityIndex(index: number, direction: -1 | 1, count: number) {
  return count > 0 ? (Math.min(Math.max(index, 0), count - 1) + direction + count) % count : 0;
}

export function teamAvailabilityListHref(view: TeamAvailabilityView = "available", search = "") {
  const params = new URLSearchParams();
  if (view === "all") params.set("view", "all");
  if (search.trim()) params.set("q", search.trim());
  const query = params.toString();
  return `/dashboard/team-availability${query ? `?${query}` : ""}`;
}

export function teamAvailabilityDetailHref(teamId: string, view: TeamAvailabilityView = "available", search = "") {
  const returnTo = teamAvailabilityListHref(view, search);
  return `/people/${encodeURIComponent(teamId)}?from=team-availability&returnTo=${encodeURIComponent(returnTo)}`;
}

export function validateTeamAvailabilityReturnTo(value: string | undefined) {
  if (!value || value.includes("#")) return "/dashboard/team-availability";
  try {
    const url = new URL(value, "http://localhost");
    if (url.origin !== "http://localhost" || url.pathname !== "/dashboard/team-availability") return "/dashboard/team-availability";
    const params = new URLSearchParams();
    const view = url.searchParams.get("view");
    const search = url.searchParams.get("q");
    if (view === "all") params.set("view", "all");
    if (search?.trim()) params.set("q", search.trim());
    const query = params.toString();
    return `/dashboard/team-availability${query ? `?${query}` : ""}`;
  } catch {
    return "/dashboard/team-availability";
  }
}

export function normalizeTeamAvailabilityView(value: string | undefined): TeamAvailabilityView {
  return value === "all" ? "all" : "available";
}
