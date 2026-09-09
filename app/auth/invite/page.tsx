import { Suspense } from "react";

import { InviteAcceptancePage } from "@/features/auth/invite-acceptance-page";

export default function InviteRedirectPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background" />}>
      <InviteAcceptancePage />
    </Suspense>
  );
}
