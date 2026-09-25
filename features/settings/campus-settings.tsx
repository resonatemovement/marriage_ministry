"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, RotateCcw, ToggleLeft } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { addCampus, renameCampus, setCampusActive } from "./campus-actions";
import type { CampusListItem } from "./campus-queries";

type Mode = "add" | "rename";

export function CampusSettings({ initialCampuses }: { initialCampuses: CampusListItem[] }) {
  const [campuses, setCampuses] = useState(initialCampuses);
  const [mode, setMode] = useState<Mode | null>(null);
  const [editing, setEditing] = useState<CampusListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(modeValue: Mode, campus?: CampusListItem) {
    setError(null);
    setEditing(campus ?? null);
    setMode(modeValue);
  }

  function close() {
    if (!pending) setMode(null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const action = mode === "rename" ? renameCampus : addCampus;
    startTransition(async () => {
      const result = await action(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      window.location.reload();
    });
  }

  function toggle(campus: CampusListItem) {
    const formData = new FormData();
    formData.set("id", campus.id);
    formData.set("active", String(!campus.active));
    startTransition(async () => {
      const result = await setCampusActive(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCampuses((current) => current.map((item) => item.id === campus.id ? { ...item, active: !item.active } : item));
    });
  }

  return <section className="mt-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Lookup Lists</p><h2 className="font-heading mt-1 text-2xl font-bold text-text-primary">Campuses</h2><p className="mt-2 text-sm text-text-muted">Manage the campuses available to active records and future onboarding.</p></div><button type="button" onClick={() => open("add")} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"><Plus className="size-4" aria-hidden="true" />Add campus</button></div><div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface"><div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-4 border-b border-border bg-surface-muted px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-muted sm:px-5"><span>Campus</span><span>Status</span><span className="sr-only">Actions</span></div>{campuses.length ? campuses.map((campus) => <div key={campus.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0 sm:px-5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-text-primary">{campus.name}</p><p className="mt-1 text-xs text-text-muted">{campus.code}</p></div><span className={campus.active ? "rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success-strong" : "rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-muted"}>{campus.active ? "Active" : "Inactive"}</span><div className="flex items-center gap-1"><button type="button" title={`Rename ${campus.name}`} aria-label={`Rename ${campus.name}`} onClick={() => open("rename", campus)} className="grid size-9 place-items-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-brand-primary"><Pencil className="size-4" aria-hidden="true" /></button><button type="button" title={campus.active ? `Deactivate ${campus.name}` : `Reactivate ${campus.name}`} aria-label={campus.active ? `Deactivate ${campus.name}` : `Reactivate ${campus.name}`} onClick={() => toggle(campus)} disabled={pending} className="grid size-9 place-items-center rounded-md text-text-muted transition hover:bg-surface-muted hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-brand-primary disabled:opacity-50">{campus.active ? <ToggleLeft className="size-4" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}</button></div></div>) : <p className="px-5 py-8 text-sm text-text-muted">No campuses have been added yet.</p>}</div><Sheet open={mode !== null} onOpenChange={(openValue) => openValue ? null : close()}><SheetContent side="right" className="overflow-y-auto p-0"><SheetHeader className="border-b border-border px-6 py-5"><SheetTitle>{mode === "rename" ? "Rename campus" : "Add campus"}</SheetTitle><SheetDescription>{mode === "rename" ? "Rename this campus without changing its existing relationships." : "Add an active campus for People and future onboarding."}</SheetDescription></SheetHeader><form onSubmit={submit} className="grid gap-4 p-6"><input type="hidden" name="id" value={editing?.id ?? ""} /><label className="grid gap-1.5 text-sm font-medium text-text-primary">Campus name<input required name="name" maxLength={120} defaultValue={editing?.name ?? ""} className="min-h-10 rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20" /></label>{error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}<div className="flex justify-end gap-3"><button type="button" onClick={close} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted">Cancel</button><button type="submit" disabled={pending} className="min-h-10 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Saving..." : mode === "rename" ? "Save name" : "Add campus"}</button></div></form></SheetContent></Sheet></section>;
}
