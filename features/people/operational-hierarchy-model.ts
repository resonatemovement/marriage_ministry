export type OperationalTeamRole = "campus_lead" | "coach" | "counselor";

export type OperationalHierarchyTeam = {
  id: string;
  name: string;
  campus: string | null;
  role: OperationalTeamRole;
  photoUrl: string | null;
};

export type OperationalHierarchy = { campusLeads: Array<OperationalHierarchyTeam & { coaches: Array<OperationalHierarchyTeam & { counselors: OperationalHierarchyTeam[] }> }> };

export function buildOperationalHierarchy(teams: OperationalHierarchyTeam[], campusLeadCoach: Array<{ campusLeadId: string; coachId: string }>, coachCounselor: Array<{ coachId: string; counselorId: string }>): OperationalHierarchy {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const counselorsByCoach = new Map<string, OperationalHierarchyTeam[]>();
  coachCounselor.forEach(({ coachId, counselorId }) => {
    const counselor = byId.get(counselorId);
    if (counselor?.role === "counselor") counselorsByCoach.set(coachId, [...(counselorsByCoach.get(coachId) ?? []), counselor]);
  });
  const coachesByLead = new Map<string, OperationalHierarchyTeam[]>();
  campusLeadCoach.forEach(({ campusLeadId, coachId }) => {
    const coach = byId.get(coachId);
    if (coach?.role === "coach") coachesByLead.set(campusLeadId, [...(coachesByLead.get(campusLeadId) ?? []), coach]);
  });
  const sort = <T extends OperationalHierarchyTeam>(items: T[]) => items.sort((a, b) => a.name.localeCompare(b.name));
  return { campusLeads: sort(teams.filter((team) => team.role === "campus_lead")).map((lead) => ({ ...lead, coaches: sort(coachesByLead.get(lead.id) ?? []).map((coach) => ({ ...coach, counselors: sort(counselorsByCoach.get(coach.id) ?? []) })) })) };
}
