"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { deleteIntakeRequest } from "./delete-actions";
import { isDeleteConfirmation } from "./model";

export function DeleteIntakeRequest({ requestId, coupleName, eligible }: { requestId: string; coupleName: string; eligible: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!eligible) return <p className="text-sm leading-6 text-text-muted">This request can’t be permanently deleted because invitations or participant records have already been created. Preserve the participant history instead.</p>;

  const close = () => { if (!pending) { setOpen(false); setConfirmation(""); setMessage(null); } };
  const submit = () => startTransition(async () => {
    const result = await deleteIntakeRequest(requestId);
    if ("error" in result) { setMessage(result.error); return; }
    router.push("/intake-requests?deleted=1");
  });

  return <><button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger-strong/40 px-3.5 py-2 text-sm font-semibold text-danger-strong transition hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-strong"><Trash2 className="size-4" aria-hidden="true" />Delete Request</button><Sheet open={open} onOpenChange={(next) => { if (next) setOpen(true); else close(); }}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle className="text-danger-strong">Permanently delete Intake Request</SheetTitle><SheetDescription>This action cannot be undone.</SheetDescription></SheetHeader><div className="grid gap-5 p-6"><div className="flex items-start gap-3 rounded-md border border-danger-strong/25 bg-danger-soft p-4 text-sm leading-6 text-danger-strong"><AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><p>Delete <strong>{coupleName}</strong> and its submission and intake-only data permanently. This does not delete participant or counseling history.</p></div><label className="grid gap-2 text-sm font-medium" htmlFor="delete-intake-confirmation">Type <span className="font-mono font-bold text-danger-strong">DELETE</span> to confirm<input id="delete-intake-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="min-h-10 rounded-md border border-border bg-white px-3 font-mono text-sm focus:outline-2 focus:outline-offset-2 focus:outline-brand-primary" /></label>{message ? <p role="alert" className="text-sm text-danger-strong">{message}</p> : null}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted">Cancel</button><button type="button" onClick={submit} disabled={pending || !isDeleteConfirmation(confirmation)} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-danger-strong px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="size-4" aria-hidden="true" />{pending ? "Deleting..." : "Delete permanently"}</button></div></div></SheetContent></Sheet></>;
}
