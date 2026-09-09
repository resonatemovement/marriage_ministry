import { PhonePhotoUpload } from "@/features/onboarding/photo-handoff";
import { validatePhotoHandoff } from "@/features/onboarding/handoff-actions";

export default async function PhotoHandoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await validatePhotoHandoff(token);
  if (!result.valid) return <main className="mx-auto min-h-screen max-w-md p-6"><h1 className="font-heading text-2xl font-bold text-text-primary">Photo handoff unavailable</h1><p className="mt-3 text-sm text-text-muted">{result.error}</p></main>;
  return <PhonePhotoUpload token={token} />;
}
