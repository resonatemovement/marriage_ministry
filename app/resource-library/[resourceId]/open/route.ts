import { NextResponse } from "next/server";
import { signedResourceAccess } from "@/features/resource-library/server";

export async function GET(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  const { resourceId } = await params;
  try {
    const versionId = new URL(request.url).searchParams.get("version") ?? undefined;
    const { signedUrl } = await signedResourceAccess(resourceId, { versionId });
    return NextResponse.redirect(signedUrl);
  } catch {
    return NextResponse.redirect(new URL("/resource-library?openError=1", request.url));
  }
}
