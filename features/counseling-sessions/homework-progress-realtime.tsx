"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, RealtimePostgresUpdatePayload } from "@supabase/supabase-js";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.generated";

import {
  createRealtimeStatusHandler,
  startFeatureRealtimeSubscription,
  startAuthReadyRealtimeSubscription,
} from "./auth-ready-realtime";

type HomeworkProgressRow = Database["public"]["Tables"]["homework_participant_progress"]["Row"];
type HomeworkRealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export const HOMEWORK_PROGRESS_REFRESH_DELAY_MS = 150;

export function subscribeToHomeworkProgress({
  assignmentRevisionId,
  client,
  refresh,
  refreshDelayMs = HOMEWORK_PROGRESS_REFRESH_DELAY_MS,
}: {
  assignmentRevisionId: string;
  client: HomeworkRealtimeClient;
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

  const handleStatus = createRealtimeStatusHandler({ feature: "homework_progress", scheduleRefresh });
  const channel = client
    .channel(`homework-progress:${assignmentRevisionId}`)
    .on<HomeworkProgressRow>(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "homework_participant_progress",
        filter: `assignment_revision_id=eq.${assignmentRevisionId}`,
      },
      (payload: RealtimePostgresUpdatePayload<HomeworkProgressRow>) => {
        if (payload.new.assignment_revision_id === assignmentRevisionId) scheduleRefresh();
      },
    )
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

export function HomeworkProgressRealtime({ assignmentRevisionId }: { assignmentRevisionId: string }) {
  const router = useRouter();

  useEffect(() => {
    return startFeatureRealtimeSubscription(() => {
      const client = createBrowserSupabaseClient();
      const subscription = startAuthReadyRealtimeSubscription({
        client,
        feature: "homework_progress",
        subscribe: () => subscribeToHomeworkProgress({
          assignmentRevisionId,
          client,
          refresh: () => router.refresh(),
        }),
      });

      return subscription.dispose;
    });
  }, [assignmentRevisionId, router]);

  return null;
}
