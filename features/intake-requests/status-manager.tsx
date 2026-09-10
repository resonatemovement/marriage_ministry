"use client";

import { useState, useTransition } from "react";
import { Send, SquareCheckBig } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CLOSE_REASONS, intakeActionLabel, intakeRequestActions, type IntakeRequestAction } from "./action-model";
import { INTAKE_STATUS_LABEL, type IntakeRequestStatus } from "./model";
import { sendIntakeRequestInvite, takeIntakeRequestAction } from "./status-actions";
import { DeleteIntakeRequest } from "./delete-request";

export function IntakeStatusManager({ requestId, status, isSuperAdmin, coupleName, deleteEligible }: { requestId: string; status: IntakeRequestStatus; isSuperAdmin: boolean; coupleName: string; deleteEligible: boolean }) {
  const actions = intakeRequestActions(status);
  const [action, setAction] = useState<IntakeRequestAction | "">(actions[0] ?? "");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const invited = status === "invited";
  const unavailable = status === "ready_to_invite";

  if (invited || unavailable) return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]"><h2 className="text-lg font-bold">Manage Request</h2><p className="mt-2 text-sm text-text-muted">{invited ? "Invitations have been created. Manage any delivery retries from People." : "This legacy status is retained for history only. Refresh the request list after the migration to continue review."}</p>{isSuperAdmin && invited ? <div className="mt-5 border-t border-border pt-5"><DeleteIntakeRequest requestId={requestId} coupleName={coupleName} eligible={deleteEligible} /></div> : null}</section>;

  return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]"><h2 className="text-lg font-bold">Manage Request</h2><p className="mt-1 text-sm text-text-muted">Current Status: <span className="font-semibold text-text-primary">{INTAKE_STATUS_LABEL[status]}</span></p><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); setMessage(null); startTransition(async () => {
    if (action === "send_invite") {
      const result = await sendIntakeRequestInvite(requestId);
      setMessage("error" in result ? result.error : result.delivery === "partial" ? "Invitations were created. One or more deliveries need a retry in People." : "Couple invitations created and sent.");
      return;
    }
    const form = new FormData(); form.set("requestId", requestId); form.set("action", action); form.set("reasonCode", reasonCode); form.set("reasonDetail", reasonDetail);
    const result = await takeIntakeRequestAction(form);
    setMessage("error" in result ? result.error : "Request updated.");
  }); }}><div className="grid gap-1.5"><label htmlFor="intake-action" className="text-sm font-medium">Action</label><Select value={action} onValueChange={(value) => { if (actions.includes(value as IntakeRequestAction)) { setAction(value as IntakeRequestAction); setReasonCode(""); setReasonDetail(""); } }}><SelectTrigger id="intake-action"><SelectValue /></SelectTrigger><SelectContent>{actions.map((option) => <SelectItem key={option} value={option}>{intakeActionLabel(option)}</SelectItem>)}</SelectContent></Select></div>{action === "close" ? <><div className="grid gap-1.5"><label htmlFor="intake-close-reason" className="text-sm font-medium">Close reason</label><Select value={reasonCode} onValueChange={setReasonCode}><SelectTrigger><SelectValue placeholder="Choose a reason" /></SelectTrigger><SelectContent>{CLOSE_REASONS.map(([code, label]) => <SelectItem key={code} value={code}>{label}</SelectItem>)}</SelectContent></Select></div>{reasonCode === "other" ? <div className="grid gap-1.5"><label htmlFor="intake-close-detail" className="text-sm font-medium">Reason details</label><input id="intake-close-detail" value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} required className="min-h-10 rounded-md border border-border bg-white px-3 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></div> : null}</> : null}{message ? <p role={message.includes("updated") || message.includes("created") ? "status" : "alert"} className={message.includes("updated") || message.includes("created") ? "text-sm text-success-strong" : "text-sm text-danger-strong"}>{message}</p> : null}<button type="submit" disabled={pending || !action || (action === "close" && (!reasonCode || (reasonCode === "other" && !reasonDetail.trim())))} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">{action === "send_invite" ? <Send className="size-4" aria-hidden="true" /> : <SquareCheckBig className="size-4" aria-hidden="true" />}{pending ? "Working..." : action ? intakeActionLabel(action) : "Choose an action"}</button></form>{isSuperAdmin ? <div className="mt-5 border-t border-border pt-5"><DeleteIntakeRequest requestId={requestId} coupleName={coupleName} eligible={deleteEligible} /></div> : null}</section>;
}
