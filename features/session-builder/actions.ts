"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";

import { requireSessionBuilderAccess } from "./access";
import { isSessionLifecycleAction, isValidMaterialUrl, materialUrlFrom, normalizeSessionTitle, richTextHasMeaningfulContent, sessionLifecycleTransition, type SessionLifecycleAction } from "./model";

type ActionResult = { success: true; sessionId?: string } | { error: string };

function titleFrom(formData: FormData) {
  return normalizeSessionTitle(String(formData.get("title") ?? ""));
}

function sessionIdFrom(formData: FormData) {
  return String(formData.get("sessionId") ?? "").trim();
}

function revalidate(sessionId?: string) {
  revalidatePath("/session-builder");
  if (sessionId) revalidatePath(`/session-builder/${sessionId}`);
}

async function client(path: string) {
  await requireSessionBuilderAccess(path);
  return createServerSupabaseClient();
}

export async function createSessionDraft(formData: FormData): Promise<ActionResult> {
  const title = titleFrom(formData);
  if (!title) return { error: "Enter a session title." };
  const supabase = await client("/session-builder/new");
  const { data: claims } = await supabase.auth.getClaims();
  const createdBy = claims?.claims?.sub;
  if (typeof createdBy !== "string") return { error: "Your session has expired. Sign in and try again." };
  const { data, error } = await supabase.from("sessions").insert({ title, created_by: createdBy }).select("id").single();
  if (error || !data) return { error: "The session could not be saved. Try again." };
  revalidate(data.id);
  return { success: true, sessionId: data.id };
}

export async function updateSessionTitle(formData: FormData): Promise<ActionResult> {
  const sessionId = sessionIdFrom(formData);
  const title = titleFrom(formData);
  if (!sessionId || !title) return { error: "Enter a session title." };
  const supabase = await client(`/session-builder/${sessionId}`);
  const { error } = await supabase.from("sessions").update({ title }).eq("id", sessionId).in("status", ["draft", "published"]);
  if (error) return { error: "The session could not be updated. Try again." };
  revalidate(sessionId);
  return { success: true };
}

export async function changeSessionLifecycle(sessionId: string, action: SessionLifecycleAction): Promise<ActionResult> {
  if (!sessionId || !isSessionLifecycleAction(action)) return { error: "This session is no longer available." };
  const target = sessionLifecycleTransition(action);
  const supabase = await client(`/session-builder/${sessionId}`);
  const { error } = await supabase.from("sessions").update({ status: target.to }).eq("id", sessionId).in("status", [...target.from]);
  if (error) return { error: "The session status could not be updated. Try again." };
  revalidate(sessionId);
  return { success: true };
}

function jsonFrom(formData: FormData): Json | null {
  try { return JSON.parse(String(formData.get("richTextContent") ?? "")) as Json; } catch { return null; }
}

export async function saveSessionMaterialBlock(formData: FormData): Promise<ActionResult> {
  const sessionId = sessionIdFrom(formData);
  const blockId = String(formData.get("blockId") ?? "").trim();
  const blockType = String(formData.get("blockType") ?? "");
  const title = normalizeSessionTitle(String(formData.get("title") ?? "")) || null;
  const description = normalizeSessionTitle(String(formData.get("description") ?? "")) || null;
  const url = materialUrlFrom(formData);
  if (!sessionId || !["rich_text", "video_link"].includes(blockType)) return { error: "This material block is invalid." };
  const richTextContent = blockType === "rich_text" ? jsonFrom(formData) : null;
  if (blockType === "rich_text" && !richTextHasMeaningfulContent(richTextContent)) return { error: "Add meaningful rich text before saving." };
  if (blockType === "video_link" && !isValidMaterialUrl(url)) return { error: "Enter a valid http or https URL." };
  const supabase = await client(`/session-builder/${sessionId}`);
  const values = { session_id: sessionId, block_type: blockType, title, rich_text_content: richTextContent, url: blockType === "video_link" ? url : null, description };
  const result = blockId ? await supabase.from("session_material_blocks").update(values).eq("id", blockId).eq("session_id", sessionId) : await supabase.from("session_material_blocks").insert({ ...values, position: await nextMaterialPosition(supabase, sessionId) });
  if (result.error) return { error: "The material block could not be saved. Try again." };
  revalidate(sessionId);
  return { success: true };
}

async function nextMaterialPosition(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, sessionId: string) {
  const { data } = await supabase.from("session_material_blocks").select("position").eq("session_id", sessionId).order("position", { ascending: false }).limit(1).maybeSingle();
  return (data?.position ?? -1) + 1;
}
