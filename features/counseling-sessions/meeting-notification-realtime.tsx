"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  RealtimeChannel,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.generated";

import {
  createRealtimeStatusHandler,
  startAuthReadyRealtimeSubscription,
  startFeatureRealtimeSubscription,
} from "./auth-ready-realtime";

type MeetingNotificationSignalRow = Database["public"]["Tables"]["meeting_notification_update_signals"]["Row"];
type MeetingNotificationRealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export const MEETING_NOTIFICATION_REFRESH_DELAY_MS = 150;

export function subscribeToMeetingNotificationUpdates({
  meetingId,
  client,
  refresh,
  refreshDelayMs = MEETING_NOTIFICATION_REFRESH_DELAY_MS,
}: {
  meetingId: string;
  client: MeetingNotificationRealtimeClient;
  refresh: () => void;
  refreshDelayMs?: number;
}) {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const scheduleRefresh = () => {
    if (disposed || refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, refreshDelayMs);
  };
  const refreshForMeeting = (
    payload: RealtimePostgresInsertPayload<MeetingNotificationSignalRow>
      | RealtimePostgresUpdatePayload<MeetingNotificationSignalRow>,
  ) => {
    if (payload.new.meeting_id === meetingId) scheduleRefresh();
  };
  const filter = {
    schema: "public",
    table: "meeting_notification_update_signals",
    filter: `meeting_id=eq.${meetingId}`,
  } as const;
  const handleStatus = createRealtimeStatusHandler({
    feature: "meeting_notifications",
    scheduleRefresh,
  });

  const channel = client
    .channel(`meeting-notifications:${meetingId}`)
    .on<MeetingNotificationSignalRow>("postgres_changes", { ...filter, event: "INSERT" }, refreshForMeeting)
    .on<MeetingNotificationSignalRow>("postgres_changes", { ...filter, event: "UPDATE" }, refreshForMeeting)
    .subscribe((status, error) => {
      if (disposed) return;
      handleStatus(status, error);
    });

  return () => {
    disposed = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    void client.removeChannel(channel);
  };
}

export function MeetingNotificationRealtime({ meetingId }: { meetingId: string }) {
  const router = useRouter();

  useEffect(() => {
    return startFeatureRealtimeSubscription(() => {
      const client = createBrowserSupabaseClient();
      const subscription = startAuthReadyRealtimeSubscription({
        client,
        feature: "meeting_notifications",
        subscribe: () => subscribeToMeetingNotificationUpdates({
          meetingId,
          client,
          refresh: () => router.refresh(),
        }),
      });

      return subscription.dispose;
    });
  }, [meetingId, router]);

  return null;
}
