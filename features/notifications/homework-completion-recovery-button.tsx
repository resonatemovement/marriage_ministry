"use client";

import { useActionState, useEffect } from "react";

import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { requestHomeworkNotificationRecovery, type HomeworkNotificationRecoveryState } from "./homework-completion-admin-actions";

export function HomeworkCompletionRecoveryButton({ deliveryId }: { deliveryId: string }) {
  const [state, action, pending] = useActionState(requestHomeworkNotificationRecovery, {} as HomeworkNotificationRecoveryState);
  useEffect(() => {
    if (state.error) showErrorToast(state.error);
    else if (state.success) showSuccessToast("The one-time Homework email recovery was queued.");
  }, [state]);
  return <form action={action}>
    <input type="hidden" name="deliveryId" value={deliveryId} />
    <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60">
      {pending ? "Requesting recovery…" : "Request one-time recovery"}
    </button>
  </form>;
}
