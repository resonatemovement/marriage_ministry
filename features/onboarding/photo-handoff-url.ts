export function buildPhotoHandoffUrl(baseUrl: string, token: string) {
  const origin = new URL(baseUrl).origin;
  return new URL(`/onboarding/photo-handoff/${encodeURIComponent(token)}`, origin).toString();
}
