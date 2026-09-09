import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { isIntakeRequestStatus, type IntakeRequestStatus } from "./model";
import type { IntakePerson, IntakeRequestDetail, IntakeRequestSummary, IntakeStatusHistory } from "./types";

type RawClient = { from: (relation: string) => { select: (columns: string) => unknown } };
type QueryResult = { data: unknown; error: { message: string } | null };
type Query = { order: (column: string, options?: { ascending?: boolean }) => Query; eq: (column: string, value: string) => Query; or: (filters: string) => Query; limit: (count: number) => Query; maybeSingle: () => Promise<QueryResult>; then: (onfulfilled: (value: QueryResult) => unknown) => Promise<unknown> };

function query(client: RawClient, table: string, columns: string) { return client.from(table).select(columns) as Query; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function rows(value: unknown) { return Array.isArray(value) ? value.map(object) : []; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function string(value: unknown) { return typeof value === "string" ? value : ""; }
function status(value: unknown): IntakeRequestStatus { return isIntakeRequestStatus(string(value)) ? string(value) as IntakeRequestStatus : "ready_for_review"; }
function person(value: unknown): IntakePerson { const row = object(value); return { id: string(row.id), personPosition: row.person_position === "partner" ? "partner" : "requester", firstName: string(row.first_name), lastName: string(row.last_name), email: string(row.email), phone: string(row.phone), city: string(row.city), resonateConnections: strings(row.resonate_connections) }; }
function summary(value: unknown): IntakeRequestSummary { const row = object(value); const campus = object(row.campuses); return { id: string(row.id), status: status(row.status), relationshipStatus: row.relationship_status === "engaged" || row.relationship_status === "married" ? row.relationship_status : "pre_engaged", campusName: string(campus.name) || null, requestedSupport: strings(row.requested_support), submittedAt: string(row.submitted_at), people: rows(row.intake_request_people).map(person) }; }

export async function getIntakeRequestQueue({ search, status: requestedStatus }: { search?: string; status?: string } = {}) {
  const supabase = await createServerSupabaseClient(); const client = supabase as unknown as RawClient;
  let request = query(client, "intake_requests", "id,status,relationship_status,requested_support,submitted_at,campuses(name),intake_request_people(id,person_position,first_name,last_name,email,phone,city,resonate_connections)").order("submitted_at", { ascending: false });
  if (requestedStatus && isIntakeRequestStatus(requestedStatus)) request = request.eq("status", requestedStatus);
  const result = await request as unknown as QueryResult;
  if (result.error) return { requests: [] as IntakeRequestSummary[], error: "Unable to load Intake Requests." };
  const requests = rows(result.data).map(summary).filter((item) => !search || item.people.some((candidate) => `${candidate.firstName} ${candidate.lastName} ${candidate.email}`.toLowerCase().includes(search.toLowerCase())));
  return { requests, error: null };
}

export async function getIntakeRequestDetail(id: string) {
  const supabase = await createServerSupabaseClient(); const client = supabase as unknown as RawClient;
  const result = await query(client, "intake_requests", "id,status,relationship_status,wedding_date,campus_other,currently_working_with_counselor,requested_support,goals,questions,referral_source,referral_source_other,submitted_at,campuses(name),intake_request_people(id,person_position,first_name,last_name,email,phone,city,resonate_connections),intake_request_status_history(id,from_status,to_status,changed_at,profiles(first_name,last_name))").eq("id", id).maybeSingle();
  if (result.error || !result.data) return null;
  const row = object(result.data); const base = summary(row); const history: IntakeStatusHistory[] = rows(row.intake_request_status_history).map((item) => { const changedBy = object(item.profiles); return { id: Number(item.id), fromStatus: item.from_status ? status(item.from_status) : null, toStatus: status(item.to_status), changedAt: string(item.changed_at), changedByName: [string(changedBy.first_name), string(changedBy.last_name)].filter(Boolean).join(" ") || null }; }).sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  return { ...base, weddingDate: string(row.wedding_date) || null, campusOther: string(row.campus_other) || null, currentlyWorkingWithCounselor: row.currently_working_with_counselor === true, goals: string(row.goals), questions: string(row.questions) || null, referralSource: string(row.referral_source), referralSourceOther: string(row.referral_source_other) || null, history } satisfies IntakeRequestDetail;
}
