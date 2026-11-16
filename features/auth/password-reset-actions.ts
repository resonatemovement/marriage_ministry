"use server";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";

import { requestPasswordReset } from "./password-reset";

export async function sendPasswordReset(email: string) {
  if (typeof email !== "string") return { status: "invalid" as const };

  return requestPasswordReset(email, process.env.APP_URL, async (normalizedEmail, redirectTo) => {
    const { url, publishableKey } = getSupabaseEnvironment();
    const supabase = createClient(url, publishableKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    if (error) throw error;
  });
}
