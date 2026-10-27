import { NextResponse } from "next/server";

import { buildSessionMaterialsPdf, contentDispositionInline } from "@/features/session-materials-export/pdf";
import { getAuthorizedSessionMaterials } from "@/features/session-materials-export/server";
import { safeHttpUrl } from "@/features/session-materials-export/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ caseSessionId: string }> }) {
  try {
    const { caseSessionId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(caseSessionId)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const session = await getAuthorizedSessionMaterials(caseSessionId);
    if (!session) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    const baseUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
    if (!safeHttpUrl(baseUrl)) throw new Error("Application URL is not configured");
    const pdf = await buildSessionMaterialsPdf(session.title, session.blocks, baseUrl);
    return new NextResponse(new Uint8Array(pdf.bytes), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(pdf.filename),
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return new Response("Session Materials PDF could not be prepared.", { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
