import type { EmailMessage, NotificationTemplateKey } from "./types";

type AdminIntakeTemplateVariables = {
  coupleName: string;
  relationshipStatus: string;
  campusName: string;
  submittedDate: string;
  requestedSupport: string;
  reviewUrl: string;
};

type CoupleIntakeTemplateVariables = { firstName: string };

const html = (value: string) => value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

export function renderAdminIntakeSubmittedEmail(variables: AdminIntakeTemplateVariables, to: string): EmailMessage {
  const subject = `New Marriage Ministry Counseling Request — ${variables.coupleName}`;
  const text = `A new counseling request has been submitted.\n\nCouple: ${variables.coupleName}\nRelationship status: ${variables.relationshipStatus}\nCampus: ${variables.campusName}\nSubmitted: ${variables.submittedDate}\nRequested support: ${variables.requestedSupport}\n\nReview Intake Request: ${variables.reviewUrl}`;
  const htmlBody = `<p>A new counseling request has been submitted.</p><dl><dt>Couple</dt><dd>${html(variables.coupleName)}</dd><dt>Relationship status</dt><dd>${html(variables.relationshipStatus)}</dd><dt>Campus</dt><dd>${html(variables.campusName)}</dd><dt>Submitted</dt><dd>${html(variables.submittedDate)}</dd><dt>Requested support</dt><dd>${html(variables.requestedSupport)}</dd></dl><p><a href="${html(variables.reviewUrl)}">Review Intake Request</a></p>`;
  return { to, subject, text, html: htmlBody };
}

export function renderCoupleIntakeSubmittedEmail(variables: CoupleIntakeTemplateVariables, to: string): EmailMessage {
  const subject = "We received your counseling request";
  const text = `Hi ${variables.firstName},\n\nThank you for reaching out to Resonate Marriage Ministry.\n\nYour counseling request has been received successfully. Our Marriage Ministry team will review the information you and your partner submitted and will contact you about the appropriate next steps.\n\nThere is nothing else you need to do at this time.\n\nResonate Marriage Ministry`;
  const htmlBody = `<p>Hi ${html(variables.firstName)},</p><p>Thank you for reaching out to Resonate Marriage Ministry.</p><p>Your counseling request has been received successfully. Our Marriage Ministry team will review the information you and your partner submitted and will contact you about the appropriate next steps.</p><p>There is nothing else you need to do at this time.</p><p>Resonate Marriage Ministry</p>`;
  return { to, subject, text, html: htmlBody };
}

export const notificationTemplateDefaults: Record<NotificationTemplateKey, { channel: "email" }> = {
  intake_submitted_admin_email: { channel: "email" },
  intake_submitted_couple_email: { channel: "email" },
};
