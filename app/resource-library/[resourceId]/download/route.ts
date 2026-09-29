import { NextResponse } from "next/server";

import { signedResourceAccess } from "@/features/resource-library/server";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  try {
    const { signedUrl } = await signedResourceAccess(resourceId, { download: true });
    return NextResponse.redirect(signedUrl);
  } catch {
    const fallback = new URL("/resource-library?downloadError=1", request.url);
    return NextResponse.redirect(fallback);
  }
}
