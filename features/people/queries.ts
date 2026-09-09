import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { coupleDisplayName, matchesPeopleFilter, type PeopleFilter, type PeopleRecord, type PeopleRecordType } from "./types";
import { peopleGroupSelection, peopleProfileSelection } from "./selections";

type QueryResult = { records: PeopleRecord[]; error?: "unauthorized" | "unavailable" };
type GroupRow = Record<string, unknown>;
type ProfileRow = Record<string, unknown>;

function value(row: Record<string, unknown>, key: string) {
  return typeof row[key] === "string" ? row[key] : null;
}

function rows(value: unknown) {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function roleNames(members: Record<string, unknown>[]) {
  return [...new Set(members.flatMap((member) => rows(member.profile_roles).map((role) => value(role, "role")).filter((role): role is string => Boolean(role))))];
}

export async function getPeopleRecords(filter: PeopleFilter, search: string): Promise<QueryResult> {
  const supabase = await createServerSupabaseClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return { records: [], error: "unauthorized" };

  const [groupsResult, profilesResult] = await Promise.all([
    supabase.from("groups").select(peopleGroupSelection).in("group_type", ["couple", "coach_team", "counselor_team"]),
    supabase.from("profiles").select(peopleProfileSelection),
  ]);
  if (groupsResult.error || profilesResult.error) return { records: [], error: "unavailable" };

  const groupedMemberIds = new Set<string>();
  const groups = (groupsResult.data as unknown as GroupRow[]).map((group) => {
    const members = rows(group.group_members).filter((member) => member.ended_at === null).map((member) => member.profile as Record<string, unknown>).filter(Boolean);
    const invitations = rows(group.invitations).filter((invitation) => invitation.status === "pending");
    members.forEach((member) => { const id = value(member, "id"); if (id) groupedMemberIds.add(id); });
    const groupType = value(group, "group_type") as "couple" | "coach_team" | "counselor_team";
    const counselingCase = rows(group.counseling_cases)[0];
    const activeAssignments = rows(counselingCase?.case_assignments).filter((assignment) => assignment.ended_at === null);
    const assignedTo = activeAssignments.map((assignment) => value(assignment.assigned_group as Record<string, unknown>, "name")).filter(Boolean).join(", ") || null;
    const campus = group.campus as Record<string, unknown> | null;
    const type = groupType === "coach_team" ? "coaches" : groupType === "counselor_team" ? "counselors" : "couples";
    const name = type === "couples"
      ? coupleDisplayName(value(group, "name"), members.map((member) => ({ firstName: value(member, "first_name"), lastName: value(member, "last_name"), email: value(member, "email") })), invitations.map((invitation) => ({ firstName: value(invitation, "first_name"), lastName: value(invitation, "last_name"), email: value(invitation, "email") })))
      : value(group, "name")!;
    return {
      id: value(group, "id")!, name, type,
      roles: roleNames(members), campus: campus ? value(campus, "name") : null,
      counselingStatus: counselingCase ? value(counselingCase, "status") as PeopleRecord["counselingStatus"] : null,
      assignedTo, updatedAt: value(group, "updated_at")!, searchText: [value(group, "name"), ...members.flatMap((member) => [value(member, "first_name"), value(member, "last_name"), value(member, "email")])].filter(Boolean).join(" ").toLowerCase(),
    } satisfies PeopleRecord;
  });
  const profiles = (profilesResult.data as unknown as ProfileRow[]).filter((profile) => !groupedMemberIds.has(value(profile, "id")!)).map((profile) => {
    const roles = rows(profile.profile_roles).map((role) => value(role, "role")).filter((role): role is string => Boolean(role));
    const type: PeopleRecordType = roles.includes("admin") || roles.includes("super_admin") ? "admins" : "authors";
    const campus = profile.campus as Record<string, unknown> | null;
    const name = [value(profile, "first_name"), value(profile, "last_name")].filter(Boolean).join(" ") || value(profile, "email")!;
    return { id: value(profile, "id")!, name, type, roles, campus: campus ? value(campus, "name") : null, counselingStatus: null, assignedTo: null, updatedAt: value(profile, "updated_at")!, searchText: [name, value(profile, "email"), campus ? value(campus, "name") : null].filter(Boolean).join(" ").toLowerCase() } satisfies PeopleRecord;
  }).filter((profile) => profile.roles.includes("admin") || profile.roles.includes("super_admin") || profile.roles.includes("author"));
  const normalizedSearch = search.trim().toLowerCase();
  return { records: [...groups, ...profiles].filter((record) => matchesPeopleFilter(record, filter) && (!normalizedSearch || record.searchText.includes(normalizedSearch))).sort((a, b) => a.name.localeCompare(b.name)) };
}
