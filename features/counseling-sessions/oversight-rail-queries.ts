import "server-only";

import type { CampusLeadCoach, CoachCounselor } from "./workspace-queries";
import { getCounselingOversightProgress, getOversightCounselorTeams } from "./oversight-queries";

export type OversightTeamNode = {
  id: string;
  name: string;
  campus: string | null;
  href: string;
  role: "Coach" | "Counselor";
  cases: Awaited<ReturnType<typeof getCounselingOversightProgress>>;
  children: OversightTeamNode[];
};

export async function getCoachCounselorNodes(counselors: readonly CoachCounselor[]): Promise<OversightTeamNode[]> {
  return Promise.all(counselors.map(async (team) => ({
    id: team.id,
    name: team.name,
    campus: team.campus,
    href: `/workspace/counselors/${team.id}`,
    role: "Counselor" as const,
    cases: await getCounselingOversightProgress(team.id),
    children: [],
  })));
}

export async function getOversightCounselorNodes(coachTeamId: string, destination: "people" | "coach-workspace" = "people"): Promise<OversightTeamNode[]> {
  const counselors = await getOversightCounselorTeams(coachTeamId);
  return Promise.all(counselors.map(async (team) => ({
    id: team.id,
    name: team.name,
    campus: team.campus,
    href: destination === "people" ? `/people/${team.id}` : `/workspace/counselors/${team.id}`,
    role: "Counselor" as const,
    cases: await getCounselingOversightProgress(team.id),
    children: [],
  })));
}

export async function getCampusLeadCoachNodes(coaches: readonly CampusLeadCoach[]): Promise<OversightTeamNode[]> {
  return Promise.all(coaches.map(async (team) => {
    const [counselors, cases] = await Promise.all([
      getOversightCounselorTeams(team.id),
      getCounselingOversightProgress(team.id),
    ]);
    const children = await Promise.all(counselors.map(async (counselor) => ({
      id: counselor.id,
      name: counselor.name,
      campus: counselor.campus,
      href: `/people/${counselor.id}`,
      role: "Counselor" as const,
      cases: await getCounselingOversightProgress(counselor.id),
      children: [],
    })));
    return { id: team.id, name: team.name, campus: team.campus, href: `/workspace/coaches/${team.id}`, role: "Coach" as const, cases, children };
  }));
}
