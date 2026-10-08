import { coupleDisplayName } from "@/features/people/types";

export type CounselingWorkspaceCoupleIdentityRow = {
  counseling_case_id: string;
  couple_group_id: string;
  group_name: string;
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  photo_path: string | null;
};

export function counselingWorkspaceCoupleIdentity(rows: readonly CounselingWorkspaceCoupleIdentityRow[]) {
  if (rows.length !== 2) throw new Error("Counseling case identity is incomplete");
  const caseId = rows[0].counseling_case_id;
  const coupleId = rows[0].couple_group_id;
  if (rows.some((row) => row.counseling_case_id !== caseId || row.couple_group_id !== coupleId)) {
    throw new Error("Counseling case identity is inconsistent");
  }
  const partners = rows.map((row) => {
    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    if (!row.profile_id || !name) throw new Error("Counseling case identity is incomplete");
    return { id: row.profile_id, name, photoPath: row.photo_path };
  });
  const coupleName = coupleDisplayName(rows[0].group_name, rows.map((row) => ({ firstName: row.first_name, lastName: row.last_name })), []);
  return { caseId, coupleId, coupleName, partners };
}
