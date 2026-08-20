import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

import type { Database } from "@/types/database.generated";

import { getSupabaseEnvironment } from "./env.ts";

export function createSupabaseServerClient(cookies: CookieMethodsServer) {
  const { url, publishableKey } = getSupabaseEnvironment();

  return createServerClient<Database>(url, publishableKey, { cookies });
}
