import { NextResponse } from "next/server";

import { signedCouplePrepareEnrichAccess } from "@/features/prepare-enrich/server";

export async function GET(request: Request) {
  try { return NextResponse.redirect((await signedCouplePrepareEnrichAccess()).signedUrl); }
  catch { return NextResponse.redirect(new URL("/workspace?prepareEnrichError=1", request.url)); }
}
