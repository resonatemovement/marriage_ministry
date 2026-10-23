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
  startFeatureRealtimeSubscription,
  startAuthReadyRealtimeSubscription,
} from "./auth-ready-realtime";

type CaseSessionRow = Database["public"]["Tables"]["case_sessions"]["Row"];
type CounselingCaseRow = Database["public"]["Tables"]["counseling_cases"]["Row"];
type CaseLifecycleRealtimeClient = {
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<unknown>;
};

export const CASE_LIFECYCLE_REFRESH_DELAY_MS = 150;

export function subscribeToCaseLifecycle({
  caseId,
  client,
  refresh,
  refreshDelayMs = CASE_LIFECYCLE_REFRESH_DELAY_MS,
}: {
  caseId: string;
  client: CaseLifecycleRealtimeClient;
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
  const refreshForSession = (
    payload: RealtimePostgresInsertPayload<CaseSessionRow> | RealtimePostgresUpdatePayload<CaseSessionRow>,
  ) => {
    if (payload.new.counseling_case_id === caseId) scheduleRefresh();
  };
  const refreshForCase = (payload: RealtimePostgresUpdatePayload<CounselingCaseRow>) => {
    if (payload.new.id === caseId) scheduleRefresh();
  };
  const handleStatus = createRealtimeStatusHandler({ feature: "case_lifecycle", scheduleRefresh });
  const channel = client
    .channel(`case-lifecycle:${caseId}`)
    .on<CaseSessionRow>("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "case_sessions",
      filter: `counseling_case_id=eq.${caseId}`,
    }, refreshForSession)
    .on<CaseSessionRow>("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "case_sessions",
      filter: `counseling_case_id=eq.${caseId}`,
    }, refreshForSession)
    .on<CounselingCaseRow>("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "counseling_cases",
      filter: `id=eq.${caseId}`,
    }, refreshForCase)
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

export function CaseLifecycleRealtime({ caseId }: { caseId: string }) {
  const router = useRouter();

  useEffect(() => {
    return startFeatureRealtimeSubscription(() => {
      const client = createBrowserSupabaseClient();
      const subscription = startAuthReadyRealtimeSubscription({
        client,
        feature: "case_lifecycle",
        subscribe: () => subscribeToCaseLifecycle({
          caseId,
          client,
          refresh: () => router.refresh(),
        }),
      });

      return subscription.dispose;
    });
  }, [caseId, router]);

  return null;
}
