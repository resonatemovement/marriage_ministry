import type { EmailMessage } from "./types";

function escapeHtml(value: string) {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

export function renderOnboardingReminderEmail(to: string, loginUrl: string): EmailMessage {
  const safeUrl = escapeHtml(loginUrl);
  const text = `Your Resonate account setup is not complete.\n\nIf you have accepted your invitation, sign in to continue setup: ${loginUrl}\n\nIf you have not accepted your invitation or it has expired, contact your ministry administrator for a new invitation.\n\nResonate Marriage Ministry`;
  const html = `<p>Your Resonate account setup is not complete.</p><p>If you have accepted your invitation, sign in to continue setup.</p><p><a href="${safeUrl}">Sign in to Resonate</a></p><p>If you have not accepted your invitation or it has expired, contact your ministry administrator for a new invitation.</p><p>Resonate Marriage Ministry</p>`;

  return {
    to,
    subject: "Continue setting up your Resonate account",
    text,
    html,
    tags: [{ name: "category", value: "onboarding_reminder" }],
  };
}
