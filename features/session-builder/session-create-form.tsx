"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createSessionDraft } from "./actions";

export function SessionCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return <form className="grid gap-5" onSubmit={(event) => { event.preventDefault(); setError(null); const formData = new FormData(event.currentTarget); startTransition(async () => { const result = await createSessionDraft(formData); if ("error" in result) { setError(result.error); return; } router.push(`/session-builder/${result.sessionId}`); router.refresh(); }); }}><label className="grid gap-1.5 text-sm font-medium text-text-primary">Session title<input name="title" required autoFocus maxLength={180} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20" /></label><button type="submit" disabled={pending} className="w-fit min-h-10 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:opacity-60">{pending ? "Saving..." : "Save Draft"}</button><p className="text-sm text-text-muted">Session Material must be added before publication is available.</p>{error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}<div className="flex flex-wrap items-center justify-end gap-3"><Link href="/session-builder" className="min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-text-muted transition hover:bg-surface-muted hover:text-text-primary">Cancel</Link><button type="button" disabled className="min-h-10 rounded-md border border-border px-4 py-2 text-sm font-semibold text-text-muted disabled:opacity-60">Publish Session</button></div></form>;
}
