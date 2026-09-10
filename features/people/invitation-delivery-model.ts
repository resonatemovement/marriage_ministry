export type InvitationDeliveryFailure =
  | "user_exists"
  | "rate_limited"
  | "redirect_configuration"
  | "email_rejected"
  | "provider_unavailable";

export function deliveryCategory(message: string): InvitationDeliveryFailure {
  const normalized = message.toLowerCase();
  if (normalized.includes("already") || normalized.includes("registered") || normalized.includes("exists")) return "user_exists";
  if (normalized.includes("rate")) return "rate_limited";
  if (normalized.includes("redirect") || normalized.includes("url")) return "redirect_configuration";
  if (normalized.includes("email") || normalized.includes("recipient")) return "email_rejected";
  return "provider_unavailable";
}
