import { PhonePhotoUpload } from "@/features/onboarding/photo-handoff";
import { PhotoHandoffUnavailable } from "@/features/onboarding/photo-handoff-unavailable";
import { validatePhotoHandoff } from "@/features/onboarding/handoff-actions";

export default async function PhotoHandoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await validatePhotoHandoff(token);
  if (!result.valid) return <PhotoHandoffUnavailable />;
  return <PhonePhotoUpload token={token} />;
}
