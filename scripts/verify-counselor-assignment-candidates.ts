import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";
const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const profileSelection = "status,onboarding_completed_at,first_name,last_name,email,campus_id,phone,photo_path";

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
function fail(error: { message: string } | null, message: string) { if (error) throw new Error(`${message}: ${error.message}`); }
function profileReady(profile: { status?: string | null; onboarding_completed_at?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; campus_id?: string | null; phone?: string | null; photo_path?: string | null } | null) {
  const digits = (profile?.phone ?? "").replace(/[^0-9]/g, "");
  return profile?.status === "active" && Boolean(profile.onboarding_completed_at) && Boolean(profile.first_name?.trim()) && Boolean(profile.last_name?.trim()) && Boolean(profile.email?.trim()) && Boolean(profile.campus_id) && /^1[0-9]{10}$/.test(digits) && Boolean(profile.photo_path);
}
function readyMembers(members: Array<{ ended_at: string | null; profile: unknown }>, invitations: Array<{ status: string }>) { const activeMembers = members.filter((member) => member.ended_at === null); return activeMembers.length === 2 && activeMembers.every((member) => profileReady((Array.isArray(member.profile) ? member.profile[0] : member.profile) as Parameters<typeof profileReady>[0])) && !invitations.some((invitation) => invitation.status === "pending"); }

async function main() {
  const { url } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Candidate verification refused outside approved DEV.");
  const admin = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: groups, error } = await admin.from("groups").select(`id,name,group_type,campus_id,active,group_members(ended_at,profile:profiles(${profileSelection})),invitations(status),counseling_cases(case_assignments(assignment_type,ended_at))`).eq("active", true);
  fail(error, "Unable to read DEV assignment candidates");
  const rows = groups ?? [];
  const richardAnna = rows.find((group) => group.group_type === "couple" && (group.group_members ?? []).filter((member) => member.ended_at === null).map((member) => { const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile; return `${profile?.first_name} ${profile?.last_name}`; }).sort().join(" & ") === "Anna Lee & Richard Price");
  const coach = rows.find((group) => group.group_type === "coach_team" && group.name === "DEV Test Coach Team");
  if (!richardAnna || !coach) throw new Error("Required Richard Price & Anna Lee / DEV Test Coach Team fixtures are unavailable.");
  const coupleMembers = richardAnna.group_members ?? [];
  if (!readyMembers(coupleMembers as Array<{ ended_at: string | null; profile: unknown }>, richardAnna.invitations ?? [])) throw new Error("Richard Price & Anna Lee is not assignment-ready.");
  if (!readyMembers((coach.group_members ?? []) as Array<{ ended_at: string | null; profile: unknown }>, coach.invitations ?? [])) throw new Error("DEV Test Coach Team is not operationally ready.");
  const counselingCase = Array.isArray(richardAnna.counseling_cases) ? richardAnna.counseling_cases[0] : richardAnna.counseling_cases;
  const assignments = counselingCase?.case_assignments ?? [];
  if (assignments.some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null)) throw new Error("Richard Price & Anna Lee already has an active Counselor-of-record.");
  if (!readyMembers(coupleMembers as Array<{ ended_at: string | null; profile: unknown }>, richardAnna.invitations ?? []) || assignments.some((assignment) => assignment.assignment_type === "counselor" && assignment.ended_at === null)) throw new Error("Richard Price & Anna Lee is absent from Coach eligible Couples.");
  const { data: campuses, error: campusError } = await admin.from("campuses").select("id,name").in("id", [coach.campus_id, richardAnna.campus_id]);
  fail(campusError, "Unable to read candidate campuses");
  const labels = new Map((campuses ?? []).map((campus) => [campus.id, campus.name]));
  console.log(`DEV Richard Price & Anna Lee (${labels.get(richardAnna.campus_id) ?? "Campus not assigned"}) is eligible for DEV Test Coach Team (${labels.get(coach.campus_id) ?? "Campus not assigned"}) without creating an assignment.`);
}

await main();
