import type { EmailMessage } from "./types";

export const HOMEWORK_COMPLETION_LOGO_URL = "https://marriage-ministry-dev.vercel.app/images/logo-email.png";
export const HOMEWORK_COMPLETION_APP_URL = "https://marriage-ministry-dev.vercel.app";

type HomeworkCompletionEmail = {
  to: string[];
  from: string;
  replyTo: string;
  notificationId: string;
  deliveryId: string;
  attemptId: string;
  completionCycle: number;
  coupleNames: readonly { firstName: string; lastName: string }[];
  sessionNumber: number;
  sessionTitle: string;
  caseId: string;
  isUpdate: boolean;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
const cleanText = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

export function renderHomeworkCompletionEmail(context: HomeworkCompletionEmail): EmailMessage {
  if (context.to.length !== 1 || !context.to[0]?.trim()) {
    throw new Error("Homework completion email requires exactly one recipient.");
  }
  const names = context.coupleNames.map(({ firstName, lastName }) => cleanText([firstName, lastName].join(" ")));
  const firstNames = context.coupleNames.map(({ firstName }) => cleanText(firstName)).join(" & ");
  const subject = `${context.isUpdate ? "Updated Homework Ready for Review" : "Homework Ready for Review"} — ${firstNames}`;
  const reviewUrl = `${HOMEWORK_COMPLETION_APP_URL}/workspace/cases/${encodeURIComponent(context.caseId)}#homework`;
  const safeNames = names.map(escapeHtml);
  const safeTitle = escapeHtml(cleanText(context.sessionTitle));
  const safeUrl = escapeHtml(reviewUrl);
  const text = [
    "Both partners have submitted their required Homework.",
    "",
    `Couple: ${names.join(" and ")}`,
    `Session ${context.sessionNumber}: ${cleanText(context.sessionTitle)}`,
    "Completion status: Both partners submitted",
    "",
    `Review Homework: ${reviewUrl}`,
    "",
    "Resonate Marriage Ministry",
  ].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background-color:#f7f7f5;font-family:Arial,Helvetica,sans-serif;color:#292524"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f7f5"><tr><td align="center" style="padding:28px 14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px"><tr><td style="padding:28px 24px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:0 0 22px"><img src="${HOMEWORK_COMPLETION_LOGO_URL}" width="48" alt="Resonate logo" style="display:block;width:48px;height:auto;border:0" /></td></tr></table><h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:#292524">${context.isUpdate ? "Homework updates are ready" : "Homework is ready for review"}</h1><p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#57534e">Both partners have submitted their required Homework.</p><p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#292524"><strong>${safeNames.join(" &amp; ")}</strong><br />Session ${context.sessionNumber}: ${safeTitle}<br />Completion status: Both partners submitted</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0"><tr><td bgcolor="#70452c" style="border-radius:7px"><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:7px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:700;color:#ffffff;text-decoration:none">Review Homework</a></td></tr></table><p style="margin:26px 0 0;border-top:1px solid #e7e5e4;padding-top:18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#78716c">Resonate Marriage Ministry</p></td></tr></table></td></tr></table></body></html>`;

  return {
    to: context.to,
    from: context.from,
    replyTo: context.replyTo,
    subject,
    text,
    html,
    tags: [
      { name: "notification_id", value: context.notificationId },
      { name: "notification_delivery_id", value: context.deliveryId },
      { name: "notification_attempt_id", value: context.attemptId },
      { name: "notification_type", value: "homework_completion" },
      { name: "completion_cycle", value: String(context.completionCycle) },
    ],
  };
}
