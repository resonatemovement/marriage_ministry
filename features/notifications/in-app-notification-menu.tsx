"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { markInAppNotificationRead } from "./in-app-actions";
import { showErrorToast } from "@/lib/toast";

export type InAppNotification = {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  case_session_id: string;
  created_at: string;
  read_at: string | null;
};

export function inAppNotificationHref(notification: InAppNotification) {
  return `/workspace/sessions/${notification.case_session_id}?tab=homework`;
}

export function InAppNotificationMenu({ notifications }: { notifications: InAppNotification[] }) {
  const [rows, setRows] = useState(notifications);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const unread = rows.filter((notification) => !notification.read_at).length;

  function openNotification(notification: InAppNotification) {
    const href = inAppNotificationHref(notification);
    if (notification.read_at) {
      router.push(href);
      return;
    }
    startTransition(async () => {
      const result = await markInAppNotificationRead(notification.id);
      if (!result.success) {
        showErrorToast("This notification could not be opened. Refresh the page and try again.");
        return;
      }
      setRows((current) => current.map((row) => row.id === notification.id ? { ...row, read_at: new Date().toISOString() } : row));
      router.push(href);
    });
  }

  return <div className="mb-4 flex justify-end">
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative inline-flex min-h-10 min-w-10 cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-3 text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted">
        <Bell className="size-5" aria-hidden="true" />
        {unread ? <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand-primary text-[10px] font-bold text-white" aria-hidden="true">{unread > 9 ? "9+" : unread}</span> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(70vh,28rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rows.length ? rows.map((notification) => <DropdownMenuItem key={notification.id} asChild disabled={pending} className={!notification.read_at ? "bg-info-soft/50" : ""}>
          <button type="button" onClick={() => openNotification(notification)} className="h-auto w-full items-start whitespace-normal py-3 text-left">
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2 font-semibold">{!notification.read_at ? <span className="size-2 shrink-0 rounded-full bg-brand-primary" aria-hidden="true" /> : null}{notification.title}</span>
              <span className="whitespace-normal text-xs leading-5 text-text-muted">{notification.message}</span>
              <time dateTime={notification.created_at} className="text-[11px] text-text-muted">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notification.created_at))}</time>
            </span>
          </button>
        </DropdownMenuItem>) : <p className="px-2 py-4 text-sm text-text-muted">You have no notifications.</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
