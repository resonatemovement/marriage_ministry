"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { INTAKE_STATUS_LABEL, isIntakeRequestStatus, manualNextIntakeStatuses, type IntakeRequestStatus } from "./model";
import { updateIntakeRequestStatus } from "./status-actions";

export function IntakeStatusManager({ requestId, status }: { requestId: string; status: IntakeRequestStatus }) {
  const options = manualNextIntakeStatuses(status); const [nextStatus, setNextStatus] = useState(options[0] ?? ""); const [pending, startTransition] = useTransition(); const [message, setMessage] = useState<string | null>(null);
  if (!options.length) return <section className="rounded-lg border border-border bg-surface p-5"><h2 className="text-lg font-bold">Manage Request</h2><p className="mt-2 text-sm text-text-muted">This request was invited through the invitation workflow and cannot be manually changed here.</p></section>;
  return <section className="rounded-lg border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(43,45,42,0.04)]"><h2 className="text-lg font-bold">Manage Request</h2><p className="mt-1 text-sm text-text-muted">Current Status: <span className="font-semibold text-text-primary">{INTAKE_STATUS_LABEL[status]}</span></p><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); setMessage(null); const form = new FormData(); form.set("requestId", requestId); form.set("currentStatus", status); form.set("nextStatus", nextStatus); startTransition(async () => { const result = await updateIntakeRequestStatus(form); setMessage("error" in result ? result.error : "Status updated."); }); }}><div className="grid gap-1.5"><label htmlFor="intake-status" className="text-sm font-medium">Change Status</label><Select value={nextStatus} onValueChange={(value) => { if (isIntakeRequestStatus(value)) setNextStatus(value); }}><SelectTrigger id="intake-status"><SelectValue /></SelectTrigger><SelectContent>{options.map((option) => <SelectItem key={option} value={option}>{INTAKE_STATUS_LABEL[option]}</SelectItem>)}</SelectContent></Select></div>{message ? <p role={message === "Status updated." ? "status" : "alert"} className={message === "Status updated." ? "text-sm text-success-strong" : "text-sm text-danger-strong"}>{message}</p> : null}<button type="submit" disabled={pending} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60"><Save className="size-4" aria-hidden="true" />{pending ? "Updating..." : "Update Status"}</button></form></section>;
}
