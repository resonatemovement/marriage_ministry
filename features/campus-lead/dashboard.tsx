import "server-only";

import { Card } from "@/components/ui/card";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CountRow = { count: number | null; error: { message: string } | null };

export async function CampusLeadDashboard() {
  const supabase = await createServerSupabaseClient();
  const [campuses, intake, couples, coaches, counselors] = await Promise.all([
    supabase.from("campus_lead_assignments" as never).select("campus:campuses(name)").is("ended_at", null),
    supabase.from("intake_requests" as never).select("id", { count: "exact", head: true }) as unknown as Promise<CountRow>,
    supabase.from("groups").select("id", { count: "exact", head: true }).eq("group_type", "couple") as unknown as Promise<CountRow>,
    supabase.from("groups").select("id", { count: "exact", head: true }).eq("group_type", "coach_team") as unknown as Promise<CountRow>,
    supabase.from("groups").select("id", { count: "exact", head: true }).eq("group_type", "counselor_team") as unknown as Promise<CountRow>,
  ]);
  const campusNames = ((campuses.data ?? []) as unknown as Array<{ campus: { name: string } | null }>).flatMap((assignment) => assignment.campus?.name ? [assignment.campus.name] : []);
  const metrics = [
    ["Intake Requests", intake.count ?? 0], ["Couples", couples.count ?? 0], ["Coaches", coaches.count ?? 0], ["Counselors", counselors.count ?? 0],
  ] as const;
  return <main className="mx-auto max-w-6xl p-5 sm:p-8 lg:p-10"><p className="text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Campus Lead workspace</p><h1 className="mt-2 font-heading text-3xl font-bold text-text-primary">{campusNames.join(" · ") || "Assigned Campus"}</h1><p className="mt-2 text-sm text-text-muted">Campus-scoped ministry overview. Intake Requests and People & Teams are read only.</p><section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <Card key={label} className="p-5"><p className="text-sm text-text-muted">{label}</p><p className="mt-2 font-heading text-3xl font-bold text-text-primary">{value}</p></Card>)}</section></main>;
}
