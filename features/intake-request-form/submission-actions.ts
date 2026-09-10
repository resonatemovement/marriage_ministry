"use server";

import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";
import { dispatchIntakeSubmittedNotifications } from "@/features/notifications/intake-submitted";

import type { IntakeDraft } from "./validation";
import {
  publicSubmissionError,
  toCreateIntakeRequestRpcArgs,
  validateIntakeSubmission,
  type IntakeSubmissionPayload,
} from "./submission";

type SubmissionClient = {
  from(name: "campuses"): {
    select(columns: "id"): {
      eq(column: "active", value: boolean): Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
    };
  };
  rpc(name: "create_intake_request", args: { payload: IntakeSubmissionPayload }): Promise<{ data: string | null; error: { message: string } | null }>;
};

function createIntakeSubmissionClient(): SubmissionClient {
  const { url } = getSupabaseEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Intake submission is not configured.");
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as SubmissionClient;
}

export type PublicIntakeSubmissionResult = { success: true } | { error: string };

export async function submitPublicIntakeRequest(draft: IntakeDraft): Promise<PublicIntakeSubmissionResult> {
  try {
    const client = createIntakeSubmissionClient();
    const campuses = await client.from("campuses").select("id").eq("active", true);
    if (campuses.error) return { error: "We could not submit your request right now. Please try again later." };

    const validation = validateIntakeSubmission(draft, (campuses.data ?? []).map((campus) => campus.id));
    if ("errors" in validation) return { error: "Please review the information in your request and try again." };

    const result = await client.rpc("create_intake_request", toCreateIntakeRequestRpcArgs(validation.value));
    if (result.error || !result.data) return { error: publicSubmissionError(new Error(result.error?.message)) };
    await dispatchIntakeSubmittedNotifications(result.data);
    return { success: true };
  } catch (error) {
    return { error: publicSubmissionError(error) };
  }
}
