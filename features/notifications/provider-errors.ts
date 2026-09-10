import type { ProviderSendResult } from "./types";

function providerMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "object" && value !== null && "message" in value && typeof value.message === "string") return value.message;
  return "Email provider rejected the delivery.";
}

const safeProviderMessage = (value: unknown) => providerMessage(value)
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]")
  .slice(0, 500);

export function mapResendFailure(error: unknown): Extract<ProviderSendResult, { success: false }> {
  const message = safeProviderMessage(error);
  const normalized = message.toLowerCase();
  return {
    success: false,
    errorCategory: normalized.includes("recipient") || normalized.includes("invalid email") || normalized.includes("email address")
      ? "invalid_recipient"
      : normalized.includes("api key") || normalized.includes("sender") || normalized.includes("from address") || normalized.includes("domain") || normalized.includes("unauthorized") || normalized.includes("forbidden")
        ? "configuration"
        : "provider_unavailable",
    errorMessage: message,
  };
}
