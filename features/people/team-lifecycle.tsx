"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { permanentlyDeleteTeam } from "./person-lifecycle-actions";

export function TeamLifecycle({ groupId, label, isSuperAdmin, intakeRequestId }: { groupId: string; label: string; isSuperAdmin: boolean; intakeRequestId?: string | null }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [confirmation, setConfirmation] = useState(""); const [message, setMessage] = useState<string | null>(null); const [pending, start] = useTransition();
  if (!isSuperAdmin) return null;
  const remove = () => start(async () => { const data = new FormData(); data.set("groupId", groupId); const result = await permanentlyDeleteTeam(data); if ("error" in result) setMessage(result.error); else router.push("/people"); });
  return <section className="mt-6 border-t border-border pt-5"><button type="button" onClick={() => { setMessage(null); setOpen(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-danger-strong/40 px-3 text-sm font-semibold text-danger-strong hover:bg-danger-soft"><Trash2 className="size-4" aria-hidden="true" />Permanently Delete</button><Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle className="text-danger-strong">Permanently delete {label}</SheetTitle><SheetDescription>This action cannot be undone.</SheetDescription></SheetHeader><div className="grid gap-5 p-6"><div className="flex gap-3 rounded-md border border-danger-strong/25 bg-danger-soft p-4 text-sm text-danger-strong"><AlertTriangle className="size-5 shrink-0" aria-hidden="true" />This permanently deletes this {label} and its disposable member accounts. Retained ministry history blocks deletion.</div><label className="grid gap-2 text-sm font-medium">Type <span className="font-mono font-bold text-danger-strong">DELETE</span> to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-10 rounded-md border border-border px-3 font-mono" /></label>{message ? <div className="grid gap-2"><p role="alert" className="text-sm text-danger-strong">{message}</p>{intakeRequestId && message.includes("Intake Request") ? <Link href={`/intake-requests/${intakeRequestId}`} className="w-fit text-sm font-semibold text-brand-primary hover:underline">View Intake Request</Link> : null}</div> : null}<div className="flex justify-end gap-3"><button type="button" onClick={() => setOpen(false)} className="min-h-10 px-3 text-sm font-semibold">Cancel</button><button type="button" disabled={pending || confirmation !== "DELETE"} onClick={remove} className="min-h-10 rounded-md bg-danger-strong px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Delete permanently</button></div></div></SheetContent></Sheet></section>;
}
