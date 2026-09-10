import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const DEV_PROJECT_REF = "lctkqjjkhpyootwvttvj";
const fixturePrefix = "verify-intake-submission-";
const fixtureName = `${fixturePrefix}${Date.now()}`;

type RpcClient = {
  rpc(name: "create_intake_request", args: { payload: Record<string, unknown> }): Promise<{ data: string | null; error: { message: string } | null }>;
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function fail(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    relationship_status: "married",
    wedding_date: "2027-06-12",
    campus_id: null,
    campus_other: "Verification campus",
    currently_working_with_counselor: false,
    requested_support: ["lay_counselor"],
    goals: "Verify deterministic public intake submission.",
    questions: null,
    referral_source: "website",
    referral_source_other: null,
    people: [
      { position: "requester", first_name: "Requester", last_name: fixtureName, email: `${fixtureName}-requester@example.test`, phone: "+14155550101", city: "", connections: ["member"] },
      { position: "partner", first_name: "Partner", last_name: fixtureName, email: `${fixtureName}-partner@example.test`, phone: "+14155550102", city: "Test City", connections: ["mc"] },
    ],
    ...overrides,
  };
}

async function main() {
  const { url, publishableKey } = getSupabaseEnvironment();
  if (new URL(url).hostname !== `${DEV_PROJECT_REF}.supabase.co`) throw new Error("Intake submission verification refused: configured project is not approved DEV.");
  const service = createClient(url, required("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  const rpc = service as unknown as RpcClient;
  const createdIds: string[] = [];

  const cleanup = async () => {
    const fixturePeople = await service.from("intake_request_people" as never).select("intake_request_id").like("last_name", `${fixturePrefix}%`);
    const ids = [...new Set([...(fixturePeople.data as unknown as { intake_request_id: string }[] | null ?? []).map((person) => person.intake_request_id), ...createdIds])];
    for (const id of ids) {
      await service.from("audit_events").delete().eq("entity_id", id);
      await service.from("intake_request_status_history" as never).delete().eq("intake_request_id", id);
      await service.from("intake_requests" as never).delete().eq("id", id);
    }
  };

  try {
    await cleanup();
    const valid = await rpc.rpc("create_intake_request", { payload: payload() });
    fail(valid.error, "Valid public Intake Request submission failed");
    if (!valid.data) throw new Error("Valid public Intake Request did not return an id");
    createdIds.push(valid.data);

    const request = await service.from("intake_requests" as never).select("id,status").eq("id", valid.data).single();
    if (request.error || (request.data as unknown as { status: string }).status !== "ready_for_review") throw new Error("Initial Intake Request status was not ready_for_review");
    const people = await service.from("intake_request_people" as never).select("person_position").eq("intake_request_id", valid.data);
    const positions = (people.data as unknown as { person_position: string }[] | null ?? []).map((person) => person.person_position).sort();
    if (people.error || positions.join(",") !== "partner,requester") throw new Error("Intake Request did not create exactly one requester and one partner");
    const history = await service.from("intake_request_status_history" as never).select("id").eq("intake_request_id", valid.data);
    if (history.error || (history.data as unknown[]).length !== 1) throw new Error("Initial Intake Request status history was not written");
    const audit = await service.from("audit_events").select("id").eq("entity_id", valid.data).eq("event_type", "intake_request.submitted");
    if (audit.error || (audit.data ?? []).length !== 1) throw new Error("Intake Request submission audit event was not written");

    const invalidPayloads = [
      payload({ people: [{ ...payload().people[0], position: "requester" }, { ...payload().people[1], position: "partner", email: `${fixtureName}-requester@example.test` }] }),
      payload({ relationship_status: "dating" }),
      payload({ people: [{ ...payload().people[0], connections: ["unknown"] }, payload().people[1]] }),
      payload({ requested_support: ["unknown"] }),
      payload({ referral_source: "unknown" }),
      payload({ campus_id: "00000000-0000-4000-8000-000000000000", campus_other: null }),
    ];
    for (const invalid of invalidPayloads) {
      const failed = await rpc.rpc("create_intake_request", { payload: invalid });
      if (!failed.error) throw new Error("Invalid public Intake Request payload succeeded");
    }

    const afterFailures = await service.from("intake_request_people" as never).select("intake_request_id").like("last_name", `${fixturePrefix}%`);
    if ((afterFailures.data as unknown as { intake_request_id: string }[] | null ?? []).length !== 2) throw new Error("Failed submissions left partial records");

    const anon = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const anonRead = await anon.from("intake_requests" as never).select("id").eq("id", valid.data);
    if (!anonRead.error && (anonRead.data as unknown[]).length > 0) throw new Error("Anon could directly read Intake Requests");
    const anonUpdate = await anon.from("intake_requests" as never).update({ goals: "unauthorized" } as never).eq("id", valid.data);
    if (!anonUpdate.error) throw new Error("Anon could directly update Intake Requests");

    console.log("DEV public Intake Request submission verified.");
  } finally {
    await cleanup();
  }
}

await main();
