import { NextResponse } from "next/server";

import { uploadPhonePhoto } from "@/features/onboarding/handoff-actions";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const image = await request.blob();
  const result = await uploadPhonePhoto(token, image);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}
