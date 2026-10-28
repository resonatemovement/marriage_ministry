"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, RealtimePostgresInsertPayload } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.generated";
import { createRealtimeStatusHandler, startAuthReadyRealtimeSubscription, startFeatureRealtimeSubscription } from "@/features/counseling-sessions/auth-ready-realtime";

type NotificationRow = Database["public"]["Tables"]["in_app_notifications"]["Row"];
type NotificationRealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export function subscribeToInAppNotifications({ profileId, client, refresh }: { profileId: string; client: NotificationRealtimeClient; refresh: () => void }) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (disposed || timer) return;
    timer = setTimeout(() => { timer = null; refresh(); }, 150);
  };
  const onStatus = createRealtimeStatusHandler({ feature: "in_app_notifications", scheduleRefresh });
  const channel = client.channel(`in-app-notifications:${profileId}`)
    .on<NotificationRow>("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "in_app_notifications",
      filter: `recipient_profile_id=eq.${profileId}`,
    }, (payload: RealtimePostgresInsertPayload<NotificationRow>) => {
      if (payload.new.recipient_profile_id === profileId) scheduleRefresh();
    })
    .subscribe((status, error) => { if (!disposed) onStatus(status, error); });
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = null;
    void client.removeChannel(channel);
  };
}

export function InAppNotificationRealtime({ profileId }: { profileId: string }) {
  const router = useRouter();
  useEffect(() => startFeatureRealtimeSubscription(() => {
    const client = createBrowserSupabaseClient();
    const subscription = startAuthReadyRealtimeSubscription({
      client,
      feature: "in_app_notifications",
      subscribe: () => subscribeToInAppNotifications({ profileId, client, refresh: () => router.refresh() }),
    });
    return subscription.dispose;
  }), [profileId, router]);
  return null;
}
