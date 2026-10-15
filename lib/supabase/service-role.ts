import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";
import { getSupabaseEnvironment } from "./env";

export function createServiceRoleSupabaseClient() {
  const { url } = getSupabaseEnvironment();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Server-side Supabase service key is not configured.");
  return createClient<Database>(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
