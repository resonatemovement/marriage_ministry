import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function getProfilePhotoUrl(path: string | null) {
  if (!path || !process.env.SUPABASE_SECRET_KEY) return null;
  const { url } = getSupabaseEnvironment();
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await admin.storage.from("profile-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
