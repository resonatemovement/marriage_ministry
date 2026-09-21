"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { changeSessionLifecycle, updateSessionTitle } from "./actions";
import { sessionLifecycleTarget, sessionStatusLabel } from "./model";
import type { SessionSummary } from "./types";

export function SessionEditor({ session, children }: { session: SessionSummary; children?: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const archived = session.status === "archived";
  const lifecycleAction = archived ? "restore" : "archive";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => { const result = await updateSessionTitle(formData); setMessage("error" in result ? result.error : "Session saved."); router.refresh(); });
  }

  function changeLifecycle() {
    setMessage(null);
    startTransition(async () => { const result = await changeSessionLifecycle(session.id, lifecycleAction); setMessage("error" in result ? result.error : lifecycleAction === "archive" ? "Session archived." : "Session restored as a draft."); router.refresh(); });
  }

  return <><form id="session-editor-form" className="grid gap-5" onSubmit={submit}><input type="hidden" name="sessionId" value={session.id} /><div className="flex flex-wrap items-center justify-between gap-3"><span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-muted">{sessionStatusLabel(session.status)}</span>{sessionLifecycleTarget(session.status, lifecycleAction) ? <button type="button" onClick={changeLifecycle} disabled={pending} className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary disabled:opacity-60">{archived ? "Restore Draft" : "Archive"}</button> : null}</div><label className="grid gap-1.5 text-sm font-medium text-text-primary">Session title<input name="title" defaultValue={session.title} required maxLength={180} disabled={archived} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted" /></label>{message ? <p role={message.includes("could not") || message.includes("Enter") ? "alert" : "status"} className="text-sm text-text-muted">{message}</p> : null}</form>{children}<div className="mt-8 flex flex-wrap justify-end gap-3 border-t border-border pt-5"><Link href="/session-builder" className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary">Back to Session Builder</Link>{!archived ? <button type="submit" form="session-editor-form" disabled={pending} className="min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">{pending ? "Saving..." : session.status === "draft" ? "Save Draft" : "Save changes"}</button> : null}</div></>;
}
