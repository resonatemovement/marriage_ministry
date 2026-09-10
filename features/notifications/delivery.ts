import type { DeliveryInput, DeliveryStore, EmailProvider } from "./types";

export async function sendDeliveryAttempt(input: DeliveryInput, store: DeliveryStore, provider: EmailProvider) {
  const deliveryId = await store.create({
    eventType: input.eventType,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId,
    templateKey: input.templateKey,
    channel: input.channel,
    recipientProfileId: input.recipientProfileId,
    recipientEmail: input.recipientEmail,
  });
  const result = await provider.send(input.message);
  if (result.success) {
    await store.markSent(deliveryId, result.providerMessageId);
    return result;
  }
  await store.markFailed(deliveryId, result.errorCategory, result.errorMessage);
  return result;
}

export async function recordDeliveryFailure(input: Omit<DeliveryInput, "message">, store: DeliveryStore, errorCategory: string, errorMessage: string) {
  const deliveryId = await store.create(input);
  await store.markFailed(deliveryId, errorCategory, errorMessage);
}
