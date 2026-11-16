import { PasswordResetPage } from "@/features/auth/password-reset-page";

export default async function PasswordResetRoute({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const params = await searchParams;
  return <PasswordResetPage tokenHash={params.token_hash ?? null} type={params.type ?? null} />;
}
