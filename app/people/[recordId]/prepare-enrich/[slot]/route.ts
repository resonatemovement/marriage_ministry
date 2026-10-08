import { NextResponse } from "next/server";

import { signedAdminPrepareEnrichAccess } from "@/features/prepare-enrich/server";

export async function GET(request: Request, { params }: { params: Promise<{ recordId: string; slot: string }> }) {
  const { recordId, slot } = await params;
  try { return NextResponse.redirect((await signedAdminPrepareEnrichAccess(recordId, slot)).signedUrl); }
  catch { return NextResponse.redirect(new URL(`/people/${recordId}?prepareEnrichError=1`, request.url)); }
}
