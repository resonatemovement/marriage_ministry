import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnvironment } from "@/lib/supabase/env";

const HEARTBEAT_NAME = "vercel-keep-alive";

type HeartbeatClient = {
  from(name: "system_heartbeat"): {
    upsert(values: { name: string; last_seen_at: string }, options: { onConflict: "name" }): {
      select(columns: "last_seen_at"): { single(): Promise<{ data: { last_seen_at: string } | null; error: { message: string } | null }> };
    };
  };
};

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) return Response.json({ error: "Keep-alive is unavailable" }, { status: 500 });

  const { url } = getSupabaseEnvironment();
  const supabase = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as HeartbeatClient;
  const { data, error } = await supabase
    .from("system_heartbeat")
    .upsert({ name: HEARTBEAT_NAME, last_seen_at: new Date().toISOString() }, { onConflict: "name" })
    .select("last_seen_at")
    .single();

  if (error || !data) return Response.json({ error: "Keep-alive failed" }, { status: 500 });
  return Response.json({ ok: true, lastSeenAt: data.last_seen_at });
}
