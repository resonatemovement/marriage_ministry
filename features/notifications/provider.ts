import "server-only";

import { Resend } from "resend";

import { mapResendFailure } from "./provider-errors";
import type { EmailProvider, EmailMessage, ProviderSendResult } from "./types";

export function createResendEmailProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  const replyTo = process.env.NOTIFICATION_REPLY_TO_EMAIL;
  if (!apiKey || !from || !replyTo) {
    return { send: async () => ({ success: false, errorCategory: "configuration", errorMessage: "Email notifications are not configured." }) };
  }
  const resend = new Resend(apiKey);
  return {
    async send(message: EmailMessage): Promise<ProviderSendResult> {
      try {
        const { data, error } = await resend.emails.send({ from, replyTo, to: message.to, subject: message.subject, text: message.text, html: message.html });
        if (error) return mapResendFailure(error);
        return { success: true, providerMessageId: data?.id ?? null };
      } catch (error) {
        return mapResendFailure(error);
      }
    },
  };
}
