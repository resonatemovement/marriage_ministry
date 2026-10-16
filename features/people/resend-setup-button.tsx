"use client";

import { useTransition } from "react";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { resendAccountSetup } from "./invitation-actions";

export function ResendSetupButton({ invitationId }: { invitationId: string }) {
  const [pending, startTransition] = useTransition();
  return <div className="mt-3 text-center"><button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await resendAccountSetup(invitationId); if ("error" in result) showErrorToast(result.error); else showSuccessToast(`Account setup email sent to ${result.name}.`); })} className="text-sm font-semibold text-brand-primary hover:underline disabled:opacity-60">{pending ? "Resending..." : "Resend setup link"}</button></div>;
}
