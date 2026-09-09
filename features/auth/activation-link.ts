export function activationUrl(appUrl: string, tokenHash: string) {
  const url = new URL("/auth/activate", appUrl);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

export function isRecoveryActivation(tokenHash: string | null, type: string | null) {
  return Boolean(tokenHash) && type === "recovery";
}
