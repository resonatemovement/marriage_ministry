"use client";

import { useRouter } from "next/navigation";
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

import { CLOSE_REASONS, intakeActionForStatus, intakeActionLabel, intakeRequestActions, normalizeIntakeReferralReason, type IntakeRequestAction } from "./action-model";
import { INTAKE_STATUS_LABEL, type IntakeRequestStatus } from "./model";
import { sendIntakeRequestInvite, takeIntakeRequestAction } from "./status-actions";
import { DeleteIntakeRequest } from "./delete-request";

type ActionSelection = { status: IntakeRequestStatus; action: IntakeRequestAction };
type IntakeStatusManagerProps = { requestId: string; status: IntakeRequestStatus; isSuperAdmin: boolean; coupleName: string; deleteEligible: boolean; canInvite?: boolean };

export function IntakeStatusManager(props: IntakeStatusManagerProps) {
  return <IntakeStatusForm key={`${props.requestId}:${props.status}`} {...props} />;
}

function IntakeStatusForm({ requestId, status, isSuperAdmin, coupleName, deleteEligible, canInvite = true }: IntakeStatusManagerProps) {
  const router = useRouter();
  const actions = intakeRequestActions(status).filter((option) => canInvite || option !== "send_invite");
  const [selection, setSelection] = useState<ActionSelection | null>(() => actions[0] ? { status, action: actions[0] } : null);
  const selectedAction = selection?.status === status ? intakeActionForStatus(status, selection.action, canInvite) : "";
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

  function resetFormState() {
    setSelection(null);
    setReasonCode("");
    setReasonDetail("");
    setConfirmReferral(false);
  }

  function runSelectedAction() {
    if (!selectedAction || selectedAction === "send_invite") return;
    const submittedAction = selectedAction;
    const form = new FormData();
    form.set("requestId", requestId);
    form.set("action", submittedAction);
    form.set("reasonCode", reasonCode);
    form.set("reasonDetail", reasonDetail);
    startTransition(async () => {
      const result = await takeIntakeRequestAction(form);
      if ("error" in result) { showErrorToast(result.error); return; }
      resetFormState();
      showSuccessToast(successMessage(submittedAction));
      router.refresh();
    });
  }

  if (invited || unavailable) return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]"><h2 className="text-lg font-bold">Manage Request</h2><p className="mt-2 text-sm text-text-muted">{invited ? "Invitations have been created. Manage any delivery retries from People." : "This legacy status is retained for history only. Refresh the request list after the migration to continue review."}</p>{isSuperAdmin && invited ? <div className="mt-5 border-t border-border pt-5"><DeleteIntakeRequest requestId={requestId} coupleName={coupleName} /></div> : null}</section>;

  return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]">
    <h2 className="text-lg font-bold">Manage Request</h2>
    <p className="mt-1 text-sm text-text-muted">Current Status: <span className="font-semibold text-text-primary">{INTAKE_STATUS_LABEL[status]}</span></p>
    <form className="mt-5 grid gap-4" onSubmit={(event) => {
      event.preventDefault();
      if (selectedAction === "refer_elsewhere") {
        if (validReferralReason) setConfirmReferral(true);
        return;
      }
      if (selectedAction === "send_invite") {
        startTransition(async () => {
          const result = await sendIntakeRequestInvite(requestId);
          if ("error" in result) { showErrorToast(result.error); return; }
          resetFormState();
          if (result.delivery === "partial") showErrorToast("Couple invitations were created, but one or more email deliveries need a retry in People.");
          else if (result.delivery === "complete") showSuccessToast("Couple invitations were created and email delivery was initiated.");
          else showSuccessToast("Couple invitations already exist. Manage delivery retries from People.");
          router.refresh();
        });
        return;
      }
      runSelectedAction();
    }}>
      <div className="grid gap-1.5">
        <label htmlFor="intake-action" className="text-sm font-medium">Action</label>
        <Select value={selectedAction} onValueChange={(value) => {
          if (actions.includes(value as IntakeRequestAction)) {
            setSelection({ status, action: value as IntakeRequestAction });
            setReasonCode("");
            setReasonDetail("");
          }
        }}>
          <SelectTrigger id="intake-action" disabled={pending}><SelectValue placeholder="Choose an action" /></SelectTrigger>
          <SelectContent>{actions.map((option) => <SelectItem key={option} value={option}>{intakeActionLabel(option)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {selectedAction === "close" ? <>
        <div className="grid gap-1.5"><label htmlFor="intake-close-reason" className="text-sm font-medium">Close reason</label><Select value={reasonCode} onValueChange={setReasonCode}><SelectTrigger id="intake-close-reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger><SelectContent>{CLOSE_REASONS.map(([code, label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}</SelectContent></Select></div>
        {reasonCode === "other" ? <div className="grid gap-1.5"><label htmlFor="intake-close-detail" className="text-sm font-medium">Reason details</label><input id="intake-close-detail" value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} required className="min-h-10 rounded-md border border-border bg-white px-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></div> : null}
      </> : null}
      {selectedAction === "refer_elsewhere" ? <div className="grid gap-1.5">
        <label htmlFor="intake-referral-reason" className="text-sm font-medium">Referral reason</label>
        <textarea id="intake-referral-reason" value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} disabled={pending} rows={4} maxLength={500} required aria-describedby="intake-referral-reason-hint" className="min-h-24 resize-y rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" />
        <p id="intake-referral-reason-hint" className="text-xs text-text-muted">Enter 10–500 characters. Surrounding whitespace is removed.</p>
      </div> : null}
      <button type="submit" disabled={pending || !selectedAction || (selectedAction === "close" && (!reasonCode || (reasonCode === "other" && !reasonDetail.trim()))) || (selectedAction === "refer_elsewhere" && !validReferralReason)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">{selectedAction === "send_invite" ? <Send className="size-4" aria-hidden="true" /> : <SquareCheckBig className="size-4" aria-hidden="true" />}{pending ? "Working..." : selectedAction ? selectedAction === "refer_elsewhere" ? "Review Referral" : intakeActionLabel(selectedAction) : "Choose an action"}</button>
    </form>
    <AlertDialog open={confirmReferral} onOpenChange={setConfirmReferral}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Refer this Intake Request elsewhere?</AlertDialogTitle>
          <AlertDialogDescription>The request will stop progressing to Couple invitations. Its referral reason will be recorded in the request history.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending || selectedAction !== "refer_elsewhere" || !validReferralReason} onClick={(event) => { event.preventDefault(); runSelectedAction(); }}>Confirm Referral</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {isSuperAdmin ? <div className="mt-5 border-t border-border pt-5"><DeleteIntakeRequest requestId={requestId} coupleName={coupleName} eligible={deleteEligible} /></div> : null}
  </section>;
}
