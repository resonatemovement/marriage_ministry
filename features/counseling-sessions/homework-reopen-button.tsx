"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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

  return <AlertDialog open={open} onOpenChange={(nextOpen) => { if (!pending) setOpen(nextOpen); }}>
    <AlertDialogTrigger asChild><button type="button" className="min-h-9 cursor-pointer rounded-md px-2 text-sm font-semibold text-brand-secondary hover:bg-surface-muted focus-visible:bg-surface-muted">Reopen<span className="sr-only"> Homework for {partnerName}</span></button></AlertDialogTrigger>
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
  </AlertDialog>;
}
