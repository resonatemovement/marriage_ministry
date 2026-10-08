import { NextResponse } from "next/server";

import { signedCounselorPrepareEnrichAccess } from "@/features/prepare-enrich/server";

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  try { return NextResponse.redirect((await signedCounselorPrepareEnrichAccess(caseId)).signedUrl); }
  catch { return NextResponse.redirect(new URL(`/workspace/cases/${caseId}?prepareEnrichError=1`, request.url)); }
}
