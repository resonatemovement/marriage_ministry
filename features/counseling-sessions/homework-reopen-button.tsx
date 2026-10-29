"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EllipsisVertical } from "lucide-react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { reopenParticipantHomework } from "./homework-reopen-actions";

export function ReopenHomeworkButton({ caseId, progressId, partnerName }: { caseId: string; progressId: string; partnerName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reopen() {
    if (pending) return;
    startTransition(async () => {
      const result = await reopenParticipantHomework(caseId, progressId);
      if (!result.success) {
        showErrorToast("Homework could not be reopened. Refresh the Case and try again.");
        setOpen(false);
        return;
      }
      showSuccessToast("Homework reopened. The partner has been notified.");
      setOpen(false);
      router.refresh();
    });
  }

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" aria-label={`Homework actions for ${partnerName}`} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md border border-border bg-surface text-text-muted hover:bg-surface-muted hover:text-text-primary focus-visible:bg-surface-muted"><EllipsisVertical className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setOpen(true)}>Reopen Homework</DropdownMenuItem></DropdownMenuContent>
    </DropdownMenu>
    <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!pending) setOpen(nextOpen); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Reopen {partnerName}&apos;s Homework?</AlertDialogTitle>
        <AlertDialogDescription>Status will change to In Progress. Existing answers will be preserved, and the partner must resubmit. The partner will receive an in-app notification.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction disabled={pending} onClick={(event) => { event.preventDefault(); reopen(); }}>{pending ? "Reopening…" : "Reopen Homework"}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
    </AlertDialog>
  </>;
}
