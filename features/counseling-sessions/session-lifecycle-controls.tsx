"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DatePicker } from "@/components/ui/date-picker";
import { TimeInput } from "@/components/ui/time-input";
import { homeworkProgressLabel } from "@/features/homework/presentation";
import { MeetingNotificationResendMenuItems, resendableMeetingNotificationPartners, type MeetingNotificationDelivery, type MeetingNotificationPartner } from "./meeting-notification-status";

import { closeCounselingCaseIncomplete, completeCounselingProgram, completeInitialMeeting, completeSessionScheduleNext, rescheduleSessionMeeting, scheduleFollowupMeeting, scheduleInitialMeeting } from "./actions";
import { COUNSELING_TIME_ZONE, counselingDateOnly } from "./meeting-date-time";
import { meetingTimeDefaults, validateMeetingSchedule, type MeetingPeriod } from "./scheduling-validation";
import { recommendedSessionContentIds, toggleSessionContentId } from "./session-content-selection";
import type { CounselingSessionCard } from "./queries";

type Mode = "schedule-initial" | "reschedule-initial" | "complete-initial" | "complete-session" | "complete-program" | "close-case" | "schedule-followup" | "reschedule-meeting";
type LifecycleCard = Pick<CounselingSessionCard, "caseId" | "coupleName" | "state" | "publishedSessions" | "homework"> & { isAdmin: boolean };

const title: Record<Mode, string> = {
  "schedule-initial": "Schedule Initial Meeting",
  "reschedule-initial": "Reschedule Initial Meeting",
  "complete-initial": "Complete Initial Meeting & Schedule First Session",
  "complete-session": "Complete Session & Schedule Next",
  "complete-program": "Complete Program",
  "close-case": "Close Counseling Case",
  "schedule-followup": "Schedule Follow-up Meeting",
  "reschedule-meeting": "Reschedule Meeting",
};

function successMessage(mode: Mode) {
  return mode === "schedule-initial" ? "Initial meeting scheduled successfully."
    : mode === "reschedule-initial" || mode === "reschedule-meeting" ? "Meeting rescheduled successfully."
    : mode === "complete-initial" ? "Initial meeting completed and first Session scheduled successfully."
    : mode === "complete-session" ? "Session completed and next Session scheduled."
    : mode === "complete-program" ? "Counseling program completed successfully."
    : mode === "close-case" ? "Counseling case closed."
    : "Follow-up meeting scheduled successfully.";
}

function inlineDomainError(error: string) {
  if (error.includes("Both partners must submit Homework")) return "Both partners must submit Homework. Admin or Super Admin may type OVERRIDE to continue.";
  if (error.includes("OVERRIDE is only accepted")) return "OVERRIDE is only accepted when required Homework is incomplete.";
  if (error.includes("Required Homework progress") || error.includes("Current Session Homework is unavailable")) return "Homework status is unavailable. Refresh the case and try again.";
  if (error.includes("Select a published Session")) return "Choose a published next Session.";
  if (error.includes("Select at least one Session content item")) return "Select at least one Page or Resource to assign.";
  if (error.includes("Duplicate Session content selection") || error.includes("Selected Session content is unavailable")) return "The selected Session content changed. Review the selection and try again.";
  if (error.includes("Session Resource is unavailable")) return "A selected Session Resource is unavailable. Choose another Session or contact an Admin.";
  if (error.includes("Select a reason for closing") || error.includes("Select a valid counseling case closure reason")) return "Select a valid reason for closing this counseling case.";
  if (error.includes("Add notes when the closure reason is Other")) return "Add notes when the closure reason is Other.";
  if (error.includes("valid meeting time") || error.includes("Meeting date") || error.includes("Meeting time")) return "Choose a valid future Meeting date and time.";
  if (error.includes("Schedule the Initial Meeting first")) return "Schedule the Initial Meeting before activating the first Session.";
  if (error.includes("already complete") || error.includes("already active") || error.includes("no longer active") || error.includes("closed or unavailable")) return "This counseling step is no longer available. Refresh the case and try again.";
  return null;
}

function failureMessage(mode: Mode) {
  return mode === "complete-session" || mode === "complete-initial" ? "Unable to complete Session. Please try again."
    : mode === "complete-program" ? "Unable to complete the counseling program. Please try again."
    : mode === "close-case" ? "Unable to close counseling case. Please try again."
    : mode === "reschedule-initial" || mode === "reschedule-meeting" ? "Unable to reschedule Meeting. Please try again."
    : mode === "schedule-followup" ? "Unable to schedule follow-up Meeting. Please try again."
    : "Unable to schedule Meeting. Please try again.";
}

function localMeetingValue(value: string | undefined, part: "date" | "time") {
  if (!value) return "";
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: COUNSELING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return part === "date" ? `${get("year")}-${get("month")}-${get("day")}` : `${get("hour")}:${get("minute")}`;
}

export function SessionLifecycleControls({ card, partners = [], deliveries = [] }: { card: LifecycleCard; partners?: MeetingNotificationPartner[]; deliveries?: MeetingNotificationDelivery[] }) {
  const initialSessionId = card.state.nextSession?.id ?? card.publishedSessions[0]?.id ?? "";
  const initialSession = card.publishedSessions.find((session) => session.id === initialSessionId);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [selectedMaterialBlockIds, setSelectedMaterialBlockIds] = useState(() => recommendedSessionContentIds(initialSession?.content ?? []));
  const [meetingDate, setMeetingDate] = useState("");
  const [minimumMeetingDate, setMinimumMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingPeriod, setMeetingPeriod] = useState<MeetingPeriod>("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [overrideConfirmation, setOverrideConfirmation] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [closureReason, setClosureReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const meeting = card.state.meeting;
  const open = mode;
  const isInitial = card.state.kind === "initial";
  const isAuthored = card.state.kind === "session";
  const isFinalSession = Boolean(card.state.caseSession?.isFinal);
  const nextSessionUnavailable = open === "complete-session" && card.publishedSessions.length === 0;
  const requiresContentSelection = open === "complete-initial" || open === "complete-session";
  const selectedSession = card.publishedSessions.find((session) => session.id === sessionId) ?? null;
  const selectedSessionContent = selectedSession?.content ?? [];
  const homeworkRequired = Boolean(card.state.caseSession?.homeworkAssignmentRevisionId);
  const homeworkComplete = !homeworkRequired || card.homework?.complete === true;
  const homeworkBlocked = !homeworkComplete;
  const overrideValid = card.isAdmin && overrideConfirmation === "OVERRIDE";
  const primaryMode: Mode | null = isInitial
    ? meeting ? "complete-initial" : "schedule-initial"
    : isAuthored ? isFinalSession ? "complete-program" : "complete-session" : null;
  const primaryLabel = isInitial
    ? meeting ? "Schedule Next Session" : "Schedule Initial Meeting"
    : isAuthored ? isFinalSession ? "Complete Program" : "Schedule Next Session" : null;
  const primaryDescription = isInitial
    ? meeting ? "Complete the initial meeting and schedule the couple’s first counseling session." : "Schedule the initial meeting before the couple’s first counseling session."
    : isAuthored && isFinalSession ? "Finish the counseling journey after the final Session."
    : isAuthored ? "Complete the current Session and schedule the couple’s next Session." : "No further action is available for this counseling case.";
  const hasResendableNotification = Boolean(meeting && resendableMeetingNotificationPartners(partners, deliveries).length);
  const hasSecondaryActions = Boolean(meeting || isAuthored) && card.state.kind !== "completed" && card.state.kind !== "closed";

  const close = () => {
    setMode(null);
    setError(null);
    setOverrideConfirmation("");
    setOverrideOpen(false);
    setClosureReason("");
    setMeetingDate("");
    setMeetingTime("");
    setMeetingPeriod("");
    setDateError(null);
    setTimeError(null);
  };

  const openMode = (nextMode: Mode) => {
    setMode(nextMode);
    setMinimumMeetingDate(counselingDateOnly(new Date()));
    setError(null);
    setMeetingDate(nextMode.startsWith("reschedule") ? localMeetingValue(meeting?.startsAt, "date") : "");
    const timeDefaults = meetingTimeDefaults(nextMode.startsWith("reschedule") ? "reschedule" : "new", nextMode.startsWith("reschedule") ? localMeetingValue(meeting?.startsAt, "time") : null);
    setMeetingTime(timeDefaults.time);
    setMeetingPeriod(timeDefaults.period);
    setDateError(null);
    setTimeError(null);
    if (nextMode === "complete-initial" || nextMode === "complete-session") {
      const nextSessionId = card.state.nextSession?.id ?? card.publishedSessions[0]?.id ?? "";
      const nextSession = card.publishedSessions.find((session) => session.id === nextSessionId);
      setSessionId(nextSessionId);
      setSelectedMaterialBlockIds(recommendedSessionContentIds(nextSession?.content ?? []));
    }
  };

  const selectSession = (nextSessionId: string) => {
    const nextSession = card.publishedSessions.find((session) => session.id === nextSessionId);
    setSessionId(nextSessionId);
    setSelectedMaterialBlockIds(recommendedSessionContentIds(nextSession?.content ?? []));
    setError(null);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (nextSessionUnavailable) return;
    const formData = new FormData(event.currentTarget);
    setError(null);
    if (requiresContentSelection && selectedMaterialBlockIds.length === 0) {
      setError("Select at least one Page or Resource to assign.");
      return;
    }
    if (open !== "complete-program" && open !== "close-case") {
      const validation = validateMeetingSchedule(meetingDate, meetingTime, meetingPeriod);
      if (validation.displayTime) setMeetingTime(validation.displayTime);
      if (validation.dateError) {
        setDateError(validation.dateError);
      }
      if (validation.timeError || !validation.time) {
        setTimeError(validation.timeError ?? "Meeting time is required.");
      }
      if (validation.dateError || validation.timeError || !validation.time) {
        return;
      }
      formData.set("date", validation.date);
      formData.set("time", validation.time);
    }
    startTransition(async () => {
      const action = open === "complete-initial"
        ? completeInitialMeeting
        : open === "complete-session"
          ? completeSessionScheduleNext
        : open === "complete-program"
          ? completeCounselingProgram
        : open === "close-case"
          ? closeCounselingCaseIncomplete
        : open === "schedule-followup"
          ? scheduleFollowupMeeting
        : open === "reschedule-meeting"
          ? rescheduleSessionMeeting
          : scheduleInitialMeeting;
      const result = await action(formData);
      if (result?.error) {
        const domainError = inlineDomainError(result.error);
        if (domainError) setError(domainError);
        else showErrorToast(failureMessage(open!));
      } else {
        showSuccessToast(successMessage(open!));
        close();
      }
    });
  };

  return <>
    <Card className="p-5" aria-label="Next Step">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Next Step</p>
      {primaryLabel && primaryMode ? <>
        <p className="mt-2 text-sm text-text-muted">{primaryDescription}</p>
        <div className="mt-4 flex w-full">
          <button type="button" onClick={() => openMode(primaryMode)} className={`min-h-11 min-w-0 flex-1 ${hasSecondaryActions ? "rounded-l-md text-left" : "rounded-md text-center inline-flex items-center justify-center"} bg-brand-primary px-3 text-sm font-bold text-white hover:bg-brand-primary/90 focus-visible:brightness-90 cursor-pointer disabled:cursor-not-allowed`}>{primaryLabel}</button>
          {hasSecondaryActions ? <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" aria-label="More counseling actions" className="grid min-h-11 w-11 shrink-0 place-items-center rounded-r-md border-l border-white/25 bg-brand-primary text-white hover:bg-brand-primary/90 focus-visible:brightness-90 cursor-pointer disabled:cursor-not-allowed"><ChevronDown className="size-4" aria-hidden="true" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
              {meeting ? <DropdownMenuItem onSelect={() => openMode(card.state.kind === "initial" ? "reschedule-initial" : "reschedule-meeting")} className="h-auto items-start whitespace-normal py-2"><span className="grid gap-0.5"><span>Reschedule Meeting</span><span className="text-xs font-normal text-text-muted">Change the date or time of the upcoming meeting.</span></span></DropdownMenuItem> : null}
              {isAuthored ? <DropdownMenuItem onSelect={() => openMode("schedule-followup")} className="h-auto items-start whitespace-normal py-2"><span className="grid gap-0.5"><span>Schedule Follow-up Meeting</span><span className="text-xs font-normal text-text-muted">Continue the current Session with another meeting.</span></span></DropdownMenuItem> : null}
              {(meeting || isAuthored) && hasResendableNotification ? <DropdownMenuSeparator /> : null}
              {meeting ? <MeetingNotificationResendMenuItems caseId={card.caseId} meetingId={meeting.id} partners={partners} deliveries={deliveries} /> : null}
              {isAuthored ? <><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => openMode("close-case")} variant="destructive" className="h-auto items-start whitespace-normal py-2"><span className="grid gap-0.5"><span>Close Counseling Case</span><span className="text-xs font-normal text-danger-strong">End counseling before the program is completed.</span></span></DropdownMenuItem></> : null}
            </DropdownMenuContent>
          </DropdownMenu> : null}
        </div>
      </> : <p className="mt-2 text-sm text-text-muted">{primaryDescription}</p>}
    </Card>
    <Sheet open={Boolean(open)} onOpenChange={(nextOpen) => { if (!nextOpen) close(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{open ? title[open] : "Meeting"}</SheetTitle>
          {open && open !== "complete-program" && open !== "close-case" ? <SheetDescription>Schedule a one-hour, in-person meeting.</SheetDescription> : null}
        </SheetHeader>
        {open ? <form noValidate className="grid gap-4 px-6 pb-6" onSubmit={submit}>
          <input type="hidden" name="caseId" value={card.caseId} />
          {open === "reschedule-meeting" && meeting ? <input type="hidden" name="meetingId" value={meeting.id} /> : null}
          {open === "complete-session" && card.state.caseSession ? <input type="hidden" name="caseSessionId" value={card.state.caseSession.id} /> : null}
          {(open === "complete-program" || open === "close-case") && card.state.caseSession ? <input type="hidden" name="caseSessionId" value={card.state.caseSession.id} /> : null}
          {open === "schedule-followup" && card.state.caseSession ? <input type="hidden" name="caseSessionId" value={card.state.caseSession.id} /> : null}
          {open === "complete-session" && nextSessionUnavailable ? <div role="status" className="grid gap-1 rounded-md bg-amber-50 px-3 py-2"><p className="text-sm font-semibold text-amber-900">Next Session</p><p className="text-sm text-amber-900">No eligible published next Session is currently available.</p><p className="text-sm text-amber-900">Publish another Session before this Session can be completed.</p></div> : null}
          {(open === "complete-initial" || open === "complete-session" && !nextSessionUnavailable) ? <>
            <div className="grid gap-1.5"><label htmlFor="next-session" className="text-sm font-medium">Next Session</label><input type="hidden" name="sessionId" value={sessionId} /><Select required value={sessionId} onValueChange={selectSession}><SelectTrigger id="next-session" className="w-full"><SelectValue placeholder="Choose a published Session" /></SelectTrigger><SelectContent>{card.publishedSessions.map((session) => <SelectItem key={session.id} value={session.id}>Session {session.number}: {session.title}</SelectItem>)}</SelectContent></Select></div>
            {selectedSession ? <section aria-labelledby="assign-session-content" className="grid gap-3 rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div><p id="assign-session-content" className="text-sm font-semibold text-text-primary">Assign Session Content</p><p className="mt-0.5 text-xs text-text-muted">{selectedMaterialBlockIds.length} selected</p></div>
                <button type="button" onClick={() => { setSelectedMaterialBlockIds(recommendedSessionContentIds(selectedSessionContent)); setError(null); }} className="min-h-9 shrink-0 rounded-md px-2 text-sm font-semibold text-brand-primary hover:bg-surface-muted focus-visible:bg-sidebar-accent">Restore Defaults</button>
              </div>
              {selectedSessionContent.length ? <div className="grid gap-2">{selectedSessionContent.map((item) => {
                const checked = selectedMaterialBlockIds.includes(item.id);
                const typeLabel = item.blockType === "rich_text" ? "Page" : "Resource";
                return <label key={item.id} htmlFor={`session-content-${item.id}`} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md bg-surface-muted px-3 py-2">
                  <Checkbox id={`session-content-${item.id}`} checked={checked} onCheckedChange={(nextChecked) => { setSelectedMaterialBlockIds((current) => toggleSessionContentId(current, item.id, nextChecked === true)); setError(null); }} className="mt-0.5" />
                  <span className="min-w-0"><span className="block text-xs font-semibold uppercase tracking-wide text-brand-secondary">{typeLabel}</span><span className="block truncate text-sm font-medium text-text-primary">{item.label}</span></span>
                </label>;
              })}</div> : <p className="text-sm text-text-muted">This published Session has no available Pages or Resources.</p>}
              {selectedMaterialBlockIds.map((id) => <input key={id} type="hidden" name="materialBlockId" value={id} />)}
              {selectedMaterialBlockIds.length === 0 ? <p role="alert" className="text-sm text-danger-strong">Select at least one Page or Resource to assign.</p> : null}
            </section> : null}
          </> : null}
          {open === "complete-session" || open === "complete-program" ? <section aria-label="Homework status" className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">Homework status</p>
            {!homeworkRequired ? <p className="text-sm text-text-muted">No Homework is required for this Session.</p> : card.homework ? <>
              {homeworkBlocked ? <div role="status" className="rounded-md bg-amber-50 px-3 py-2"><p className="text-sm font-semibold text-amber-900">Homework must be completed first</p><p className="mt-0.5 text-sm text-amber-900">Both partners need to submit their required Homework before you can complete this Session.</p></div> : null}
              {card.homework.partners.map((partner) => {
                const firstName = partners.find((item) => item.id === partner.profileId)?.firstName?.trim() || partner.name.split(/\s+/)[0] || partner.name;
                return <div key={partner.profileId} className="flex justify-between gap-3 text-sm"><span>{firstName}</span><span className={partner.status === "submitted" || partner.status === "reviewed" ? "font-medium text-success-strong" : "font-medium text-amber-800"}>{partner.status === "submitted" || partner.status === "reviewed" ? "Submitted" : homeworkProgressLabel(partner.status)}</span></div>;
              })}
            </> : <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Homework status is unavailable, so this Session cannot be completed yet.</p>}
            {homeworkBlocked && card.isAdmin ? <Collapsible open={overrideOpen} onOpenChange={(expanded) => { setOverrideOpen(expanded); if (!expanded) setOverrideConfirmation(""); }} className="mt-1">
              <CollapsibleTrigger type="button" className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-md bg-surface-muted px-3 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:bg-surface-muted focus-visible:text-text-primary data-[state=open]:bg-sidebar-accent">
                <span className="grid gap-0.5"><span className="text-sm font-semibold text-text-primary">Admin override</span><span className="text-xs font-normal text-text-muted">Continue without completed Homework.</span></span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted transition-transform data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 grid gap-2 rounded-md bg-surface-muted p-3">
                <p className="text-sm text-text-muted">Continue without completed Homework. Outstanding Homework will remain incomplete.</p>
                <label htmlFor="override-confirmation" className="text-sm font-medium">Type OVERRIDE to continue</label>
                <input id="override-confirmation" name="overrideConfirmation" value={overrideConfirmation} onChange={(event) => setOverrideConfirmation(event.target.value)} autoComplete="off" className="min-h-11 rounded-md border border-border bg-white px-3" />
              </CollapsibleContent>
            </Collapsible> : null}
          </section> : null}
          {open !== "complete-program" && open !== "close-case" && !nextSessionUnavailable && (open !== "complete-session" || homeworkComplete || overrideValid) ? <>
            <input type="hidden" name="date" value={meetingDate} />
            <DatePicker label="Meeting date" value={meetingDate} required minDate={minimumMeetingDate} error={dateError} onChange={(value) => { setMeetingDate(value); setDateError(null); setError(null); }} />
            <TimeInput
              label="Meeting time (required)"
              name="time"
              value={meetingTime}
              period={meetingPeriod}
              error={timeError}
              onChange={(value) => { setMeetingTime(value); setTimeError(null); setError(null); }}
              onPeriodChange={(period) => { setMeetingPeriod(period); setTimeError(null); setError(null); }}
            />
          </> : null}
          {open === "close-case" ? <section className="grid gap-3 rounded-md border border-danger-strong/30 bg-danger-soft/40 p-3"><p className="text-sm font-semibold text-danger-strong">This ends counseling without normal program completion. Session history, meetings, materials, and Homework responses will be preserved.</p><div className="grid gap-1.5"><label htmlFor="closure-reason" className="text-sm font-medium">Reason{card.isAdmin ? " (optional for Admin)" : ""}</label><input type="hidden" name="closureReason" value={closureReason} /><Select value={closureReason} onValueChange={setClosureReason}><SelectTrigger id="closure-reason" className="w-full"><SelectValue placeholder="Select a reason" /></SelectTrigger><SelectContent>{["Couple withdrew", "Unable to contact couple", "Couple relocated", "Referred elsewhere", "Counseling relationship ended", "Other"].map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}</SelectContent></Select></div>{closureReason === "Other" ? <label className="grid gap-1.5 text-sm font-medium">Notes<textarea required name="closureNotes" rows={3} className="rounded-md border border-border bg-white px-3 py-2" /></label> : <input type="hidden" name="closureNotes" value="" />}</section> : null}
          {open === "complete-initial" && !card.publishedSessions.length ? <p role="alert" className="text-sm text-danger-strong">A published Session with Material and Homework is required.</p> : null}
          {error && error !== "Meeting date is required." ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}
          {!nextSessionUnavailable ? <button disabled={pending || ((open === "complete-initial" || open === "complete-session") && (!sessionId || selectedMaterialBlockIds.length === 0)) || ((open === "complete-session" || open === "complete-program") && homeworkBlocked && (!card.isAdmin || !overrideValid)) || (open === "close-case" && !closureReason && !card.isAdmin)} className="min-h-11 rounded-md bg-brand-primary px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? "Saving…" : title[open]}</button> : null}
        </form> : null}
      </SheetContent>
    </Sheet>
  </>;
}
