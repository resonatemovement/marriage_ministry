import { NextResponse } from "next/server";

import { uploadPhonePhoto } from "@/features/onboarding/handoff-actions";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer" };
  try {
    const { token } = await params;
    const image = await request.blob();
    const result = await uploadPhonePhoto(token, image);
    return NextResponse.json(result, { status: result.success ? 200 : 400, headers });
  } catch {
    return NextResponse.json({ success: false, error: "The photo could not be uploaded. Please try again." }, { status: 400, headers });
  }
}
