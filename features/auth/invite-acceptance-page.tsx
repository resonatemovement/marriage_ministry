"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

import { acceptInvitation, type InvitationAcceptanceResult } from "./invitation-acceptance-actions";
import { isRecoveryActivation } from "./activation-link";

const messages: Record<Extract<InvitationAcceptanceResult, { success: false }>["error"], string> = {
  no_session: "Sign in through your invitation email to continue.",
  invalid: "This invitation is not valid. Contact your ministry administrator for help.",
  expired: "This invitation has expired. Contact your ministry administrator for a new invitation.",
  revoked: "This invitation is no longer available. Contact your ministry administrator for help.",
  identity_mismatch: "This invitation belongs to a different account. Sign in with the invited email address.",
  already_accepted: "This invitation cannot be completed with this account. Contact your ministry administrator for help.",
  unexpected: "We could not establish your account. Please try again or contact your ministry administrator.",
};

export function InviteAcceptancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function establishAccount() {
      const tokenHash = searchParams.get("token_hash");
      const type = searchParams.get("type");
      if (!isRecoveryActivation(tokenHash, type) || !tokenHash) {
        setError("This activation link is invalid or incomplete. Ask your ministry administrator to resend the invitation.");
        return;
      }

      const supabase = createBrowserSupabaseClient();
      const { error: verificationError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (verificationError) {
        // A consumed token is safe to retry only in the browser that already has its session.
        const { data: existing } = await supabase.auth.getUser();
        if (!existing.user) {
          setError("This activation link is invalid or has expired. Ask your ministry administrator to resend the invitation.");
          return;
        }
      }

      const result = await acceptInvitation();
      if (result.success === false) {
        setError(messages[result.error]);
        return;
      }

      router.replace("/auth/create-password");
      router.refresh();
    }

    void establishAccount();
  }, [router, searchParams]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-8">
      <section className="w-full rounded-lg border border-border bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04)]">
        <h1 className="font-heading text-2xl font-bold text-text-primary">Activating your account</h1>
        {error ? <p role="alert" className="mt-3 text-sm leading-6 text-danger-strong">{error}</p> : <p className="mt-3 text-sm leading-6 text-text-muted">Please wait while we securely activate your Resonate account.</p>}
      </section>
    </main>
  );
}
