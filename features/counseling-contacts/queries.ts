import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import { createDetailMember, type PeopleDetailMember } from "@/features/people/detail-model";
import { orderCouplePartners } from "@/features/people/partner-order";

export type CounselingContactDetail = {
  id: string;
  name: string;
  kind: "couple" | "team";
  roleLabel: string;
  campus: string | null;
  caseStatus: string | null;
  members: PeopleDetailMember[];
};

type ContactRow = {
  group_id: string; group_name: string | null; group_type: string; assignment_type: string | null;
  campus_name: string | null; member_id: string; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; photo_path: string | null; profile_status: string;
  onboarding_completed_at: string | null; roles: string[]; gender?: "male" | "female" | null; case_status?: string;
};

function roleLabel(assignmentType: string | null, groupType: string) {
  if (assignmentType === "couple" || groupType === "couple") return "Couple";
  if (assignmentType === "campus_lead" || groupType === "campus_lead_team") return "Campus Lead";
  if (assignmentType === "coach" || groupType === "coach_team") return "Coach";
  return "Counselor";
}

export async function getCounselingContactDetail(caseId: string, groupId: string): Promise<CounselingContactDetail | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_counseling_contact_group", { target_case_id: caseId, target_group_id: groupId });
  if (error) throw new Error("Counseling contact data is unavailable");
  const rows = (data ?? []) as unknown as ContactRow[];
  const first = rows[0];
  if (!first) return null;
  const members = await Promise.all(rows.map(async (row) => createDetailMember({
    id: row.member_id,
    firstName: row.first_name,
    gender: row.gender ?? null,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    photoPath: row.photo_path,
    photoUrl: await getProfilePhotoUrl(row.photo_path),
    roles: row.roles ?? [],
    status: row.profile_status === "invited" || row.profile_status === "password_required" || row.profile_status === "onboarding" || row.profile_status === "deactivated" ? row.profile_status : "active",
    onboardingCompletedAt: row.onboarding_completed_at,
  })));
  return {
    id: first.group_id,
    name: first.group_name ?? "Counseling contact",
    kind: first.group_type === "couple" ? "couple" : "team",
    roleLabel: roleLabel(first.assignment_type, first.group_type),
    campus: first.campus_name,
    caseStatus: first.case_status ?? null,
    members: first.group_type === "couple" ? orderCouplePartners(members) : members,
  };
}

export async function getCurrentCoupleCounselor() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_current_couple_case_counselor");
  if (error) throw new Error("Couple Workspace is unavailable");
  const counselor = data?.[0];
  return counselor ? { caseId: counselor.counseling_case_id, id: counselor.counselor_group_id, name: counselor.counselor_name ?? "Counselor" } : null;
}
