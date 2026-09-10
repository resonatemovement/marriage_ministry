export type NotificationChannel = "email" | "sms";

export type NotificationEvent = "intake.submitted";

export type NotificationTemplateKey =
  | "intake_submitted_admin_email"
  | "intake_submitted_couple_email";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type ProviderSendResult =
  | { success: true; providerMessageId: string | null }
  | { success: false; errorCategory: "configuration" | "invalid_recipient" | "provider_unavailable"; errorMessage: string };

export type DeliveryInput = {
  eventType: NotificationEvent;
  relatedEntityType: "intake_request";
  relatedEntityId: string;
  templateKey: NotificationTemplateKey;
  channel: NotificationChannel;
  recipientProfileId: string | null;
  recipientEmail: string;
  message: EmailMessage;
};

export type DeliveryStore = {
  create(input: Omit<DeliveryInput, "message">): Promise<string>;
  markSent(id: string, providerMessageId: string | null): Promise<void>;
  markFailed(id: string, errorCategory: string, errorMessage: string): Promise<void>;
};

export type EmailProvider = { send(message: EmailMessage): Promise<ProviderSendResult> };
