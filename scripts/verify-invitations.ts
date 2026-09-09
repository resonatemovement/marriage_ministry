import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const prefix = `verify-invitations-${Date.now()}`;

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Invitation verification refused: configured project is not approved DEV.");
  const adminEmail = required("TEST_ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("TEST_ADMIN_PASSWORD");
  const coachEmail = required("TEST_COACH_EMAIL").toLowerCase();
  const coachPassword = required("TEST_COACH_PASSWORD");
  const admin = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const adminUser = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const coachUser = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const adminSignIn = await adminUser.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  fail(adminSignIn.error, "Unable to sign in DEV Admin");
  const coachSignIn = await coachUser.auth.signInWithPassword({ email: coachEmail, password: coachPassword });
  fail(coachSignIn.error, "Unable to sign in DEV Coach");
  if (!adminSignIn.data.session || !coachSignIn.data.session) throw new Error("Invitation verification sessions are missing");

  const rpc = async (token: string, role: string, campusId: string, invitees: Array<{ email: string; first_name: string; last_name: string }>) => {
    const response = await fetch(`${url}/rest/v1/rpc/create_invitations`, { method: "POST", headers: { apikey: publishableKey, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ payload: { role, campus_id: campusId, invitees } }) });
    const text = await response.text();
    return { response, payload: text ? JSON.parse(text) as { invitation_ids?: string[]; group_id?: string | null; message?: string } : null };
  };
  const campusResult = await admin.from("campuses").select("id").eq("active", true).limit(1).single();
  fail(campusResult.error, "Unable to read active DEV Campus");
  if (!campusResult.data) throw new Error("Active DEV Campus is missing");
  const campusId = campusResult.data.id;
  const createdInvitations: string[] = [];
  const createdGroups: string[] = [];
  const createdAudit: string[] = [];
  let temporaryCampusId: string | null = null;
  try {
    const one = await rpc(adminSignIn.data.session.access_token, "author", campusId, [{ email: `${prefix}-one@example.test`, first_name: "One", last_name: "Invite" }]);
    if (!one.response.ok || one.payload?.invitation_ids?.length !== 1 || one.payload.group_id !== null) throw new Error(`One-person invitation contract failed: HTTP ${one.response.status} ${JSON.stringify(one.payload)}`);
    createdInvitations.push(...one.payload.invitation_ids!);
    const oneRow = await admin.from("invitations").select("id,email,intended_role,campus_id,status,group_id").eq("id", one.payload.invitation_ids![0]).single();
    fail(oneRow.error, "Unable to read one-person invitation");
    if (!oneRow.data) throw new Error("One-person invitation row is missing");
    if (oneRow.data.email !== `${prefix}-one@example.test` || oneRow.data.intended_role !== "author" || oneRow.data.campus_id !== campusId || oneRow.data.status !== "pending" || oneRow.data.group_id !== null) throw new Error("One-person invitation fields are incorrect");
    const pendingDuplicate = await rpc(adminSignIn.data.session.access_token, "author", campusId, [{ email: `${prefix}-one@example.test`, first_name: "Again", last_name: "Invite" }]);
    if (pendingDuplicate.response.ok) throw new Error("Existing pending invitation was accepted");
    const activeDuplicate = await rpc(adminSignIn.data.session.access_token, "author", campusId, [{ email: adminEmail, first_name: "Existing", last_name: "User" }]);
    if (activeDuplicate.response.ok) throw new Error("Existing active user invitation was accepted");

    for (const role of ["couple", "coach", "counselor"]) {
      const result = await rpc(adminSignIn.data.session.access_token, role, campusId, [{ email: `${prefix}-${role}-1@example.test`, first_name: "First", last_name: role }, { email: `${prefix}-${role}-2@example.test`, first_name: "Second", last_name: role }]);
      if (!result.response.ok || result.payload?.invitation_ids?.length !== 2 || !result.payload.group_id) throw new Error(`Grouped ${role} invitation contract failed`);
      createdInvitations.push(...result.payload.invitation_ids!); createdGroups.push(result.payload.group_id);
      const rows = await admin.from("invitations").select("id,status,group_id").in("id", result.payload.invitation_ids!);
      fail(rows.error, `Unable to read grouped ${role} invitations`);
      if (rows.data?.length !== 2 || rows.data.some((row) => row.status !== "pending" || row.group_id !== result.payload!.group_id)) throw new Error(`Grouped ${role} invitations are incorrect`);
      const group = await admin.from("groups").select("id,group_type").eq("id", result.payload.group_id).single();
      fail(group.error, `Unable to read grouped ${role} group`);
      if (!group.data) throw new Error(`Grouped ${role} group is missing`);
      if (group.data.group_type !== (role === "couple" ? "couple" : `${role}_team`)) throw new Error(`Grouped ${role} type is incorrect`);
    }

    const audit = await admin.from("audit_events").select("id,actor_id,entity_id,event_type").in("entity_id", createdInvitations).eq("event_type", "invitation.created");
    fail(audit.error, "Unable to read invitation audit events");
    if ((audit.data ?? []).length !== createdInvitations.length || audit.data?.some((event) => !event.actor_id || !createdInvitations.includes(event.entity_id))) throw new Error("Invitation audit events are incomplete");
    createdAudit.push(...(audit.data ?? []).map((event) => String(event.id)));

    const duplicate = await rpc(adminSignIn.data.session.access_token, "couple", campusId, [{ email: `${prefix}-duplicate@example.test`, first_name: "Same", last_name: "Email" }, { email: ` ${prefix.toUpperCase()}-DUPLICATE@example.test `, first_name: "Same", last_name: "Email" }]);
    if (duplicate.response.ok) throw new Error("Duplicate grouped emails were accepted");
    const rollbackRows = await admin.from("invitations").select("id").ilike("email", `${prefix}-duplicate%`);
    fail(rollbackRows.error, "Unable to verify grouped rollback invitations");
    if ((rollbackRows.data ?? []).length !== 0) throw new Error("Failed grouped invitation left partial invitation rows");
    const unauthorized = await rpc(coachSignIn.data.session.access_token, "author", campusId, [{ email: `${prefix}-unauthorized@example.test`, first_name: "No", last_name: "Access" }]);
    if (unauthorized.response.ok) throw new Error("Unauthorized invitation creation was accepted");
    const inactive = await admin.from("campuses").insert({ name: `${prefix} inactive`, code: `${prefix.slice(0, 20)}I`, active: false }).select("id").single();
    fail(inactive.error, "Unable to create temporary inactive Campus");
    if (!inactive.data) throw new Error("Temporary inactive Campus is missing");
    temporaryCampusId = inactive.data.id;
    const rejected = await rpc(adminSignIn.data.session.access_token, "author", inactive.data.id, [{ email: `${prefix}-inactive@example.test`, first_name: "Inactive", last_name: "Campus" }]);
    if (rejected.response.ok) throw new Error("Inactive Campus invitation was accepted");
    await admin.from("campuses").delete().eq("id", inactive.data.id);
    temporaryCampusId = null;
    console.log("DEV invitation RPC contract verified.");
  } finally {
    if (createdAudit.length) await admin.from("audit_events").delete().in("id", createdAudit);
    if (createdInvitations.length) await admin.from("invitations").delete().in("id", createdInvitations);
    if (createdGroups.length) await admin.from("groups").delete().in("id", createdGroups);
    if (temporaryCampusId) await admin.from("campuses").delete().eq("id", temporaryCampusId);
  }
}

await main();
