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

type MeetingRow = Database["public"]["Tables"]["case_session_meetings"]["Row"];
type MeetingRealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export const MEETING_REFRESH_DELAY_MS = 150;

export function subscribeToCaseMeetings({
  caseId,
  client,
  refresh,
  refreshDelayMs = MEETING_REFRESH_DELAY_MS,
}: {
  caseId: string;
  client: MeetingRealtimeClient;
  refresh: () => void;
  refreshDelayMs?: number;
}) {
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;
  let disconnectedAfterConnection = false;
  let disposed = false;

  const scheduleRefresh = () => {
    if (disposed || refreshTimer) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh();
    }, refreshDelayMs);
  };
  const refreshForCase = (
    payload: RealtimePostgresInsertPayload<MeetingRow> | RealtimePostgresUpdatePayload<MeetingRow>,
  ) => {
    if (payload.new.counseling_case_id === caseId) scheduleRefresh();
  };
  const filter = {
    schema: "public",
    table: "case_session_meetings",
    filter: `counseling_case_id=eq.${caseId}`,
  } as const;

  const channel = client
    .channel(`case-meetings:${caseId}`)
    .on<MeetingRow>("postgres_changes", { ...filter, event: "INSERT" }, refreshForCase)
    .on<MeetingRow>("postgres_changes", { ...filter, event: "UPDATE" }, refreshForCase)
    .subscribe((status) => {
      if (disposed) return;
      if (status === "SUBSCRIBED") {
        if (connected && disconnectedAfterConnection) scheduleRefresh();
        connected = true;
        disconnectedAfterConnection = false;
        return;
      }
      if (connected) disconnectedAfterConnection = true;
    });

  return () => {
    disposed = true;
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    void client.removeChannel(channel);
  };
}

export function MeetingRealtime({ caseId }: { caseId: string }) {
  const router = useRouter();

  useEffect(() => subscribeToCaseMeetings({
    caseId,
    client: createBrowserSupabaseClient(),
    refresh: () => router.refresh(),
  }), [caseId, router]);

  return null;
}
