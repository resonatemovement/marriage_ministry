import { NextResponse } from "next/server";

import { signedResourceAccess } from "@/features/resource-library/server";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  try {
    const versionId = new URL(request.url).searchParams.get("version") ?? undefined;
    const { signedUrl } = await signedResourceAccess(resourceId, { versionId, download: true });
    return NextResponse.redirect(signedUrl);
  } catch {
    const fallback = new URL("/resource-library?downloadError=1", request.url);
    return NextResponse.redirect(fallback);
  }
}
