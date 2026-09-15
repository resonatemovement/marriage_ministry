"use client";

import { useState, useTransition } from "react";

import { resendAccountSetup } from "./invitation-actions";

export function ResendSetupButton({ invitationId }: { invitationId: string }) {
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  return <div className="mt-3 text-center"><button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await resendAccountSetup(invitationId); const isError = "error" in result; setFailed(isError); setMessage(isError ? result.error : `Setup link resent to ${result.name}.`); })} className="text-sm font-semibold text-brand-primary hover:underline disabled:opacity-60">{pending ? "Resending..." : "Resend setup link"}</button>{message ? <p role={failed ? "alert" : "status"} className={failed ? "mt-2 rounded-md bg-danger-soft px-3 py-2 text-xs font-semibold text-danger-strong" : "mt-2 text-xs text-text-muted"}>{message}</p> : null}</div>;
}
