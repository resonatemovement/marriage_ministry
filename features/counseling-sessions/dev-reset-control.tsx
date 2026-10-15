"use client";

import { useState, useTransition } from "react";

import { Card } from "@/components/ui/card";

import { resetCounselingJourney } from "./actions";

export function DevResetControl({ caseId }: { caseId: string }) {
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => startTransition(async () => {
    setError(null);
    setSuccess(false);
    const result = await resetCounselingJourney(formData);
    if (result.error) setError(result.error);
    else {
      setConfirmation("");
      setSuccess(true);
    }
  });

  return <Card className="mt-8 border border-border p-5 sm:p-6">
    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">DEV Testing</p>
    <h2 className="font-heading mt-2 text-lg font-bold text-text-primary">Reset Counseling Journey</h2>
    <p className="mt-2 max-w-3xl text-sm text-text-muted">This permanently erases this case’s Session, Meeting, released Material, and Homework lifecycle data. Couple accounts, team assignments, Prepare &amp; Enrich documents, and curriculum remain.</p>
    <form action={submit} className="mt-4 grid max-w-md gap-3">
      <input type="hidden" name="caseId" value={caseId} />
      <label htmlFor="reset-confirmation" className="text-sm font-medium text-text-primary">Type RESET to restore the case to Matched before Session 0.</label>
      <input id="reset-confirmation" name="confirmation" type="text" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="min-h-11 rounded-md border border-border bg-white px-3" />
      <button type="submit" disabled={pending || confirmation !== "RESET"} className="min-h-11 w-fit rounded-md bg-danger-strong px-4 text-sm font-bold text-white hover:bg-danger-strong/90 focus-visible:bg-danger-strong/80 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Resetting…" : "Reset Counseling Journey"}</button>
      {error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}
      {success ? <p role="status" className="text-sm text-success-strong">Journey reset. The case is ready to schedule the Initial Meeting.</p> : null}
    </form>
  </Card>;
}
