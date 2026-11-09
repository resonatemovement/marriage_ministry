"use client";

import { useState, useTransition } from "react";
import { Send, SquareCheckBig } from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CLOSE_REASONS, intakeActionLabel, intakeRequestActions, normalizeIntakeReferralReason, type IntakeRequestAction } from "./action-model";
import { INTAKE_STATUS_LABEL, type IntakeRequestStatus } from "./model";
import { sendIntakeRequestInvite, takeIntakeRequestAction } from "./status-actions";
import { DeleteIntakeRequest } from "./delete-request";

export function IntakeStatusManager({ requestId, status, isSuperAdmin, coupleName, deleteEligible, canInvite = true }: { requestId: string; status: IntakeRequestStatus; isSuperAdmin: boolean; coupleName: string; deleteEligible: boolean; canInvite?: boolean }) {
  const actions = intakeRequestActions(status).filter((option) => canInvite || option !== "send_invite");
  const [action, setAction] = useState<IntakeRequestAction | "">(actions[0] ?? "");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [confirmReferral, setConfirmReferral] = useState(false);
  const [pending, startTransition] = useTransition();
  const invited = status === "invited";
  const unavailable = status === "ready_to_invite";
  const validReferralReason = normalizeIntakeReferralReason(reasonDetail) !== null;

  function successMessage(completedAction: IntakeRequestAction) {
    if (completedAction === "start_review") return "Intake request review started successfully.";
    if (completedAction === "close") return "Intake request closed successfully.";
    if (completedAction === "reopen") return "Intake request reopened successfully.";
    return "Intake request referred elsewhere successfully.";
  }

  function runSelectedAction() {
    if (!action || action === "send_invite") return;
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("action", action);
    form.set("reasonCode", reasonCode);
    form.set("reasonDetail", reasonDetail);
    startTransition(async () => {
      const result = await takeIntakeRequestAction(form);
      if ("error" in result) { showErrorToast(result.error); return; }
      setConfirmReferral(false);
      showSuccessToast(successMessage(action));
    });
  }

  if (invited || unavailable) return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]"><h2 className="text-lg font-bold">Manage Request</h2><p className="mt-2 text-sm text-text-muted">{invited ? "Invitations have been created. Manage any delivery retries from People." : "This legacy status is retained for history only. Refresh the request list after the migration to continue review."}</p>{isSuperAdmin && invited ? <div className="mt-5 border-t border-border pt-5"><DeleteIntakeRequest requestId={requestId} coupleName={coupleName} /></div> : null}</section>;

  return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]">
    <h2 className="text-lg font-bold">Manage Request</h2>
    <p className="mt-1 text-sm text-text-muted">Current Status: <span className="font-semibold text-text-primary">{INTAKE_STATUS_LABEL[status]}</span></p>
    <form className="mt-5 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (action === "refer_elsewhere") {
        if (validReferralReason) setConfirmReferral(true);
        return;
      }
      if (action === "send_invite") {
        startTransition(async () => {
          const result = await sendIntakeRequestInvite(requestId);
          if ("error" in result) { showErrorToast(result.error); return; }
          if (result.delivery === "partial") showErrorToast("Couple invitations were created, but one or more email deliveries need a retry in People.");
          else if (result.delivery === "complete") showSuccessToast("Couple invitations were created and email delivery was initiated.");
          else showSuccessToast("Couple invitations already exist. Manage delivery retries from People.");
        });
        return;
      }
      runSelectedAction();
    }}>
      <div className="grid gap-1.5">
        <label htmlFor="intake-action" className="text-sm font-medium">Action</label>
        <Select value={action} onValueChange={(value) => {
          if (actions.includes(value as IntakeRequestAction)) {
            setAction(value as IntakeRequestAction);
            setReasonCode("");
            setReasonDetail("");
          }
        }}>
          <SelectTrigger id="intake-action"><SelectValue /></SelectTrigger>
          <SelectContent>{actions.map((option) => <SelectItem key={option} value={option}>{intakeActionLabel(option)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {action === "close" ? <>
        <div className="grid gap-1.5"><label htmlFor="intake-close-reason" className="text-sm font-medium">Close reason</label><Select value={reasonCode} onValueChange={setReasonCode}><SelectTrigger id="intake-close-reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger><SelectContent>{CLOSE_REASONS.map(([code, label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}</SelectContent></Select></div>
        {reasonCode === "other" ? <div className="grid gap-1.5"><label htmlFor="intake-close-detail" className="text-sm font-medium">Reason details</label><input id="intake-close-detail" value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} required className="min-h-10 rounded-md border border-border bg-white px-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></div> : null}
      </> : null}
      {action === "refer_elsewhere" ? <div className="grid gap-1.5">
        <label htmlFor="intake-referral-reason" className="text-sm font-medium">Referral reason</label>
        <textarea id="intake-referral-reason" value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} rows={4} maxLength={500} required aria-describedby="intake-referral-reason-hint" className="min-h-24 resize-y rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" />
        <p id="intake-referral-reason-hint" className="text-xs text-text-muted">Enter 10–500 characters. Surrounding whitespace is removed.</p>
      </div> : null}
      <button type="submit" disabled={pending || !action || (action === "close" && (!reasonCode || (reasonCode === "other" && !reasonDetail.trim()))) || (action === "refer_elsewhere" && !validReferralReason)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">{action === "send_invite" ? <Send className="size-4" aria-hidden="true" /> : <SquareCheckBig className="size-4" aria-hidden="true" />}{pending ? "Working..." : action ? action === "refer_elsewhere" ? "Review Referral" : intakeActionLabel(action) : "Choose an action"}</button>
    </form>
    <AlertDialog open={confirmReferral} onOpenChange={setConfirmReferral}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Refer this Intake Request elsewhere?</AlertDialogTitle>
          <AlertDialogDescription>The request will stop progressing to Couple invitations. Its referral reason will be recorded in the request history.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending || !validReferralReason} onClick={(event) => { event.preventDefault(); runSelectedAction(); }}>Confirm Referral</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {isSuperAdmin ? <div className="mt-5 border-t border-border pt-5"><DeleteIntakeRequest requestId={requestId} coupleName={coupleName} eligible={deleteEligible} /></div> : null}
  </section>;
}
