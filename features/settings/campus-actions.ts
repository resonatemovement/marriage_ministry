"use server";

import { revalidatePath } from "next/cache";

import { requireWorkspace } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { normalizeCampusName } from "./campus-model";

type CampusResult = { error: string } | { success: true };

function value(formData: FormData, field: string) {
  const raw = formData.get(field);
  return typeof raw === "string" ? raw.trim() : "";
}

function codeForName(name: string) {
  const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48);
  return code || "CAMPUS";
}

function saveError(): CampusResult {
  return { error: "The campus could not be saved. Check the name and try again." };
}

async function authorize() {
  await requireWorkspace("admin", "/settings");
  return createServerSupabaseClient();
}

async function hasActiveDuplicate(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, name: string, excludedId?: string) {
  const { data, error } = await supabase.from("campuses").select("id").ilike("name", name).eq("active", true);
  if (error) return true;
  return (data ?? []).some((campus) => campus.id !== excludedId);
}

export async function addCampus(formData: FormData): Promise<CampusResult> {
  const name = normalizeCampusName(value(formData, "name"));
  if (!name || name.length > 120) return { error: "Enter a campus name of up to 120 characters." };
  const supabase = await authorize();
  if (await hasActiveDuplicate(supabase, name)) return { error: "An active campus with that name already exists." };
  const { error } = await supabase.from("campuses").insert({ name, code: codeForName(name) });
  if (error) return saveError();
  revalidatePath("/settings");
  revalidatePath("/people");
  return { success: true };
}

export async function renameCampus(formData: FormData): Promise<CampusResult> {
  const id = value(formData, "id");
  const name = normalizeCampusName(value(formData, "name"));
  if (!id || !name || name.length > 120) return { error: "Enter a campus name of up to 120 characters." };
  const supabase = await authorize();
  if (await hasActiveDuplicate(supabase, name, id)) return { error: "An active campus with that name already exists." };
  const { error } = await supabase.from("campuses").update({ name }).eq("id", id);
  if (error) return saveError();
  revalidatePath("/settings");
  revalidatePath("/people");
  return { success: true };
}

export async function setCampusActive(formData: FormData): Promise<CampusResult> {
  const id = value(formData, "id");
  const active = value(formData, "active") === "true";
  if (!id) return saveError();
  const supabase = await authorize();
  const { error } = await supabase.from("campuses").update({ active }).eq("id", id);
  if (error) return saveError();
  revalidatePath("/settings");
  revalidatePath("/people");
  return { success: true };
}
