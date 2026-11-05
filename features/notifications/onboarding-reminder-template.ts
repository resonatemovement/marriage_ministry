import type { EmailMessage } from "./types";

export const ONBOARDING_REMINDER_LOGO_URL = "https://marriage-ministry-dev.vercel.app/images/logo-email.png";

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

export function renderOnboardingReminderEmail(to: string, loginUrl: string): EmailMessage {
  const safeUrl = escapeHtml(loginUrl);
  const logo = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 24px"><img src="${ONBOARDING_REMINDER_LOGO_URL}" width="48" height="51" alt="Resonate logo" style="display:block;width:48px;height:auto;max-width:100%;border:0;text-decoration:none;outline:none" /></td></tr></table>`;
  const text = `Your Resonate account setup is not complete.\n\nIf you have accepted your invitation, sign in to continue setup: ${loginUrl}\n\nIf you have not accepted your invitation or it has expired, contact your ministry administrator for a new invitation.\n\nResonate Marriage Ministry`;
  const html = `${logo}<p>Your Resonate account setup is not complete.</p><p>If you have accepted your invitation, sign in to continue setup.</p><p><a href="${safeUrl}">Sign in to Resonate</a></p><p>If you have not accepted your invitation or it has expired, contact your ministry administrator for a new invitation.</p><p>Resonate Marriage Ministry</p>`;

  return {
    to,
    subject: "Continue setting up your Resonate account",
    text,
    html,
    tags: [{ name: "category", value: "onboarding_reminder" }],
  };
}
