"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { resendMeetingNotification } from "./actions";
import { formatMeetingNotificationTime } from "./meeting-date-time";

export type MeetingNotificationDelivery = { id: string; event_type: string; template_key: string; recipient_profile_id: string | null; recipient_email: string | null; status: string; error_category: string | null; error_message: string | null; created_at: string; attempt_number: number };
export type MeetingNotificationPartner = { id: string; firstName?: string | null; name?: string };
type State = { error?: string; success?: boolean; deliveryStatus?: string; deliveryError?: string | null };

const eventLabels: Record<string, string> = {
  "meeting.scheduled": "Scheduled",
  "meeting.rescheduled": "Rescheduled",
  "homework.reminder.72h": "72-hour Homework reminder",
  "meeting.reminder.24h": "24-hour Meeting reminder",
};
const resendBlockedStatuses = ["bounced", "complained", "suppressed", "no_email"];
const isDevSink = (delivery: MeetingNotificationDelivery) => delivery.template_key.endsWith("_dev_sink");
const partnerFirstName = (partner: MeetingNotificationPartner) => partner.firstName?.trim() || partner.name?.trim().split(/\s+/)[0] || "Partner";

function safeResendError(error: string) {
  if (error.includes("bounced, complained, or suppressed")) return "Resend is blocked because this address is bounced, complained, or suppressed.";
  if (error.includes("Homework is already complete")) return "Homework is already complete or unavailable; no reminder was resent.";
  if (error.includes("Meeting is no longer upcoming")) return "This Meeting is no longer upcoming, so its invite cannot be resent.";
  if (error.includes("Counseling case is no longer active") || error.includes("Session is no longer active")) return "This counseling journey is no longer active, so the notification cannot be resent.";
  if (error.includes("Only a current scheduled Meeting")) return "Only a current scheduled Meeting invite can be resent.";
  if (error.includes("unavailable")) return "This Meeting notification is no longer available to resend.";
  return "Unable to resend Meeting invite. Please try again.";
}

export function deliveryTime(delivery: MeetingNotificationDelivery) {
  return formatMeetingNotificationTime(delivery.created_at);
}

function latestPartnerDeliveries(partnerId: string, deliveries: MeetingNotificationDelivery[]) {
  return deliveries
    .filter((delivery) => delivery.recipient_profile_id === partnerId)
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at) || right.attempt_number - left.attempt_number);
}

export function resendableMeetingNotificationPartners(partners: MeetingNotificationPartner[], deliveries: MeetingNotificationDelivery[]) {
  return partners.filter((partner) => {
    const latest = latestPartnerDeliveries(partner.id, deliveries)[0];
    return Boolean(latest && !resendBlockedStatuses.includes(latest.status));
  });
}

function ResendMenuItem({ caseId, meetingId, partner, delivery }: { caseId: string; meetingId: string; partner: MeetingNotificationPartner; delivery: MeetingNotificationDelivery }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (_previous: State, formData: FormData) => await resendMeetingNotification(formData) as State, {} as State);
  const firstName = partnerFirstName(partner);
  useEffect(() => {
    if (state.error) showErrorToast(safeResendError(state.error));
    else if (state.success && state.deliveryStatus === "sent") showSuccessToast("Meeting invite resend initiated.");
    else if (state.success && state.deliveryStatus === "duplicate") showSuccessToast("A matching Meeting invite attempt was already recorded.");
    else if (state.success) showErrorToast("The resend attempt was recorded, but the email could not be sent. Review delivery history.");
  }, [state]);
  return <>
    <form ref={formRef} action={action} className="hidden" aria-hidden="true">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="deliveryId" value={delivery.id} />
      <input type="hidden" name="profileId" value={partner.id} />
    </form>
    <DropdownMenuItem onSelect={(event) => { event.preventDefault(); formRef.current?.requestSubmit(); }} disabled={pending} className="h-auto min-h-10 whitespace-normal py-2">
      <span>Resend meeting invite to {firstName}</span>
    </DropdownMenuItem>
  </>;
}

export function MeetingNotificationResendMenuItems({ caseId, meetingId, partners, deliveries }: { caseId: string; meetingId: string; partners: MeetingNotificationPartner[]; deliveries: MeetingNotificationDelivery[] }) {
  return <>
    {resendableMeetingNotificationPartners(partners, deliveries).map((partner) => {
      const latest = latestPartnerDeliveries(partner.id, deliveries)[0]!;
      return <ResendMenuItem key={partner.id} caseId={caseId} meetingId={meetingId} partner={partner} delivery={latest} />;
    })}
  </>;
}

export function MeetingNotificationStatus({ partners, deliveries }: { partners: MeetingNotificationPartner[]; deliveries: MeetingNotificationDelivery[] }) {
  const [historyPartner, setHistoryPartner] = useState<MeetingNotificationPartner | null>(null);
  const history = historyPartner ? latestPartnerDeliveries(historyPartner.id, deliveries) : [];
  return <section className="mt-6 border-t border-border pt-6" aria-label="Meeting invites">
    <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Meeting invites</p>
    <ul className="mt-1 divide-y divide-border">
      {partners.map((partner) => {
        const attempts = latestPartnerDeliveries(partner.id, deliveries);
        const latest = attempts[0];
        return <li key={partner.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-2 first:pt-1 last:pb-0">
          <span className="truncate text-sm font-medium text-text-primary">{partnerFirstName(partner)}</span>
          {latest ? <span className="text-right text-xs font-semibold capitalize text-text-primary">{latest.status.replaceAll("_", " ")}</span> : <span className="text-right text-xs text-text-muted">Not sent</span>}
          <span className="min-w-0 truncate text-xs text-text-muted">{latest ? `${eventLabels[latest.event_type] ?? latest.event_type} ${deliveryTime(latest)}` : "No invite history"}</span>
          {latest ? <button type="button" onClick={() => setHistoryPartner(partner)} className="cursor-pointer text-right text-xs font-semibold text-brand-secondary underline underline-offset-2">View history</button> : <span />}
        </li>;
      })}
    </ul>
    <Sheet open={Boolean(historyPartner)} onOpenChange={(open) => { if (!open) setHistoryPartner(null); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{historyPartner ? `${partnerFirstName(historyPartner)}’s Meeting invite history` : "Meeting invite history"}</SheetTitle>
          <SheetDescription>All recorded invitation and reminder attempts for the current Meeting.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-6 pb-6">
          {history.some(isDevSink) ? <p className="rounded-md bg-surface-muted p-3 text-xs text-text-muted">DEV: Meeting invites are routed to Resend&apos;s test recipient.</p> : null}
          {history.length ? <ol className="grid gap-3">{history.map((attempt) => <li key={attempt.id} className="grid gap-1 border-b border-border pb-3 text-sm last:border-0">
            <p className="font-semibold text-text-primary">{eventLabels[attempt.event_type] ?? attempt.event_type}</p>
            <p className="text-text-muted">Attempt {attempt.attempt_number} · <span className="capitalize">{attempt.status.replaceAll("_", " ")}</span> · {deliveryTime(attempt)}</p>
            {attempt.error_message ? <p className="text-danger-strong">{attempt.error_message}</p> : null}
          </li>)}</ol> : <p className="text-sm text-text-muted">No notification attempts are recorded.</p>}
        </div>
      </SheetContent>
    </Sheet>
  </section>;
}
