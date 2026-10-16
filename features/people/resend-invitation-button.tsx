"use client";
import { useTransition } from "react";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { resendPeopleInvitation } from "./invitation-actions";
export function ResendInvitationButton({ invitationId }: { invitationId: string }) { const [pending, startTransition] = useTransition(); return <div className="mt-3 text-center"><button type="button" disabled={pending} onClick={() => startTransition(async () => { const result = await resendPeopleInvitation(invitationId); if ("error" in result) showErrorToast(result.error); else showSuccessToast(`Invitation email resent to ${result.name}.`); })} className="text-sm font-semibold text-brand-primary hover:underline disabled:opacity-60">{pending ? "Resending..." : "Resend Invite"}</button></div>; }
