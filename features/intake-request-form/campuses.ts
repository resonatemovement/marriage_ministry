import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";
export async function getPublicCampuses() { const { url } = getSupabaseEnvironment(); const key = process.env.SUPABASE_SECRET_KEY; if (!key) return []; const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }); const { data } = await client.from("campuses").select("id,name").eq("active", true).order("name"); return data ?? []; }
