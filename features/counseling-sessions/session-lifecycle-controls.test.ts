import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controls = readFileSync("features/counseling-sessions/session-lifecycle-controls.tsx", "utf8");
const actions = readFileSync("features/counseling-sessions/actions.ts", "utf8");
const timeInput = readFileSync("components/ui/time-input.tsx", "utf8");

describe("lifecycle scheduling date control", () => {
  it("uses one shared required DatePicker and keeps time selection without native validation", () => {
    expect(controls).toContain('import { DatePicker } from "@/components/ui/date-picker"');
    expect(controls).toContain('<DatePicker label="Meeting date" value={meetingDate} required minDate={minimumMeetingDate} error={dateError}');
    expect(controls.match(/<DatePicker\b/g)).toHaveLength(1);
    expect(controls).toContain('<input type="hidden" name="date" value={meetingDate} />');
    expect(controls).toContain('<form noValidate');
    expect(controls).toContain('onSubmit={submit}');
    expect(controls).not.toContain('action={submit}');
    expect(controls).toContain("event.preventDefault()");
    expect(controls).toContain("new FormData(event.currentTarget)");
    expect(controls).toContain('import { TimeInput } from "@/components/ui/time-input"');
    expect(controls).toContain("<TimeInput");
    expect(controls).toContain('label="Meeting time (required)"');
    expect(controls).toContain('name="time"');
    expect(controls).toContain("value={meetingTime}");
    expect(controls.match(/<TimeInput\b/g)).toHaveLength(1);
    expect(controls).not.toContain('type="time"');
    expect(timeInput).toContain('import { Input } from "@/components/ui/input"');
    expect(timeInput).toContain('import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"');
    expect(timeInput).toContain('type="text"');
    expect(timeInput).toContain('placeholder="hh:mm"');
    expect(timeInput).toContain('label = "Meeting time (required)"');
    expect(timeInput).toContain('<SelectItem value="AM">AM</SelectItem>');
    expect(timeInput).toContain('<SelectItem value="PM">PM</SelectItem>');
    expect(timeInput).toContain('aria-invalid={error ? true : undefined}');
    expect(timeInput).toContain('role="alert" className="text-sm text-danger-strong">{error}</p>');
    expect(controls).not.toContain("DEV time diagnostics");
    expect(controls).not.toContain("recordTimeDiagnostic");
    expect(controls).not.toContain("console.info");
  });

  it("validates required date/time inline before invoking the existing lifecycle actions", () => {
    expect(controls).toContain("validateMeetingSchedule(");
    expect(controls).toContain("validateMeetingSchedule(meetingDate, meetingTime, meetingPeriod)");
    expect(controls).not.toContain('formData.get("time")');
    expect(controls).toContain("setDateError(validation.dateError)");
    expect(controls).toContain("setTimeError(validation.timeError ?? \"Meeting time is required.\")");
    expect(controls).toContain('formData.set("time", validation.time)');
    expect(controls.indexOf("if (validation.timeError || !validation.time)")).toBeLessThan(controls.indexOf("startTransition(async () => {"));
    expect(actions).toContain("validateCanonicalMeetingStart(date, time)");
    expect(actions).toContain("validation.instant");
  });

  it("validates every server scheduling action before calling its existing RPC", () => {
    for (const actionName of ["scheduleInitialMeeting", "completeInitialMeeting", "completeSessionScheduleNext", "scheduleFollowupMeeting", "rescheduleSessionMeeting"]) {
      const start = actions.indexOf(`export async function ${actionName}`);
      const nextAction = actions.indexOf("\nexport async function ", start + 1);
      const actionBody = actions.slice(start, nextAction === -1 ? undefined : nextAction);
      expect(actionBody).toContain("meetingTimes(formData)");
      expect(actionBody.indexOf('if ("error" in times) return times;')).toBeLessThan(actionBody.indexOf("supabase.rpc("));
    }
  });

  it("keeps entered text visible through field and server-action errors", () => {
    expect(controls).toContain("value={meetingTime}");
    expect(controls).toContain("period={meetingPeriod}");
    expect(controls).toContain("setMeetingTime(value)");
    expect(controls).toContain("validateMeetingSchedule(meetingDate, meetingTime, meetingPeriod)");
    expect(controls).toContain("if (result?.error) {\n        const domainError = inlineDomainError(result.error);");
    expect(controls).toContain("if (domainError) setError(domainError);");
    expect(controls).toContain("showErrorToast(failureMessage(open!));");
    expect(controls).toContain("showSuccessToast(successMessage(open!));");
    expect(controls).toContain('formData.set("time", validation.time)');
    expect(controls).toContain("setTimeError(validation.timeError ?? \"Meeting time is required.\")");
  });

  it("does not validate while interacting with the time or AM/PM fields; submit runs shared validation", () => {
    expect(timeInput).toContain("onChange={handleChange}");
    expect(timeInput).not.toContain("onBlur");
    expect(controls).not.toContain("onBlur={() => {");
    expect(controls).toContain("validateMeetingSchedule(meetingDate, meetingTime, meetingPeriod)");
    expect(controls).toContain("if (validation.timeError || !validation.time)");
  });

  it("uses PM defaults for new meeting flows and the saved local time for reschedules", () => {
    expect(controls).toContain('meetingTimeDefaults(nextMode.startsWith("reschedule") ? "reschedule" : "new"');
    expect(controls).toContain("setMeetingPeriod(timeDefaults.period)");
    expect(controls).toContain('? meeting ? "complete-initial" : "schedule-initial"');
    expect(controls).toContain('onSelect={() => openMode(card.state.kind === "initial" ? "reschedule-initial" : "reschedule-meeting")}');
    expect(controls).toContain('onSelect={() => openMode("schedule-followup")}');
  });

  it("routes all six scheduling and rescheduling actions through the shared controls", () => {
    for (const mode of ["schedule-initial", "reschedule-initial", "complete-initial", "complete-session", "schedule-followup", "reschedule-meeting"]) expect(controls).toContain(`"${mode}"`);
    expect(controls).toContain('const action = open === "complete-initial"');
    expect(controls).toContain('? completeInitialMeeting');
    expect(controls).toContain(': open === "complete-session"');
    expect(controls).toContain('? completeSessionScheduleNext');
    expect(controls).toContain(': open === "schedule-followup"');
    expect(controls).toContain('? scheduleFollowupMeeting');
    expect(controls).toContain('open !== "complete-program" && open !== "close-case"');
  });

  it("uses concise scheduling helper copy and formats digit entry on blur or submit without per-keystroke validation", () => {
    expect(controls).toContain("Schedule a one-hour, in-person meeting.");
    expect(controls).not.toContain("{card.coupleName} · meetings are scheduled");
    expect(controls).toContain("setMeetingTime(validation.displayTime)");
    expect(timeInput).toContain("inputMode=\"numeric\"");
    expect(timeInput).toContain("onChange={handleChange}");
    expect(controls).toContain("onChange={(value) => { setMeetingTime(value); setTimeError(null); setError(null); }}");
  });

  it("admits Super Admin to all exposed schedule actions while preserving existing Admin and case-scoped staff paths", () => {
    expect(actions.match(/requireOneOfRoles\(\[\.\.\.CARE_ROLES, "super_admin"\]/g)).toHaveLength(4);
    const initialScheduleAction = actions.slice(actions.indexOf("export async function scheduleInitialMeeting"), actions.indexOf("export async function completeInitialMeeting"));
    const firstSessionAction = actions.slice(actions.indexOf("export async function completeInitialMeeting"), actions.indexOf("export async function completeSessionScheduleNext"));
    const nextSessionAction = actions.slice(actions.indexOf("export async function completeSessionScheduleNext"), actions.indexOf("export async function scheduleFollowupMeeting"));
    expect(initialScheduleAction).toContain('[...CARE_ROLES, "super_admin"]');
    expect(initialScheduleAction).not.toContain('"admin"');
    expect(firstSessionAction).toContain('[...CARE_ROLES, "super_admin"]');
    expect(firstSessionAction).not.toContain('"admin"');
    expect(nextSessionAction).toContain('[...CARE_ROLES, "admin", "super_admin"]');
  });

  it("uses the Next Step hierarchy and preserves the underlying lifecycle flows", () => {
    expect(controls).toContain(">Next Step</p>");
    expect(controls).toContain('const isFinalSession = Boolean(card.state.caseSession?.isFinal)');
    expect(controls).toContain(': isAuthored ? isFinalSession ? "complete-program" : "complete-session" : null');
    expect(controls).toContain(': isAuthored ? isFinalSession ? "Complete Program" : "Schedule Next Session" : null');
    expect(controls).toContain("No eligible published next Session is currently available.");
    expect(controls).toContain("Publish another Session before this Session can be completed.");
    expect(controls).toContain('((open === "complete-initial" || open === "complete-session") && (!sessionId || selectedMaterialBlockIds.length === 0))');
    expect(controls).toContain('onClick={() => openMode(primaryMode)}');
    expect(controls).toContain('const primaryMode: Mode | null = isInitial\n    ? meeting ? "complete-initial" : "schedule-initial"');
    expect(controls).toContain('const primaryLabel = isInitial\n    ? meeting ? "Schedule Next Session" : "Schedule Initial Meeting"');
    expect(controls).not.toContain("Complete Initial Meeting &amp; Schedule First Session</button>");
    expect(controls).not.toContain("Complete Session &amp; Schedule Next</button>");
    expect(controls).toContain("Reschedule Meeting");
    expect(controls).toContain("Change the date or time of the upcoming meeting.");
    expect(controls).toContain("Schedule Follow-up Meeting");
    expect(controls).toContain("Continue the current Session with another meeting.");
    expect(controls).toContain('variant="destructive"');
    expect(controls).toContain("End counseling before the program is completed.");
    expect(controls).toContain("MeetingNotificationResendMenuItems");
    expect(controls).toContain("cursor-pointer");
    expect(controls).toContain("disabled:opacity-60");
    expect(controls).not.toContain("DevResetControl");
    expect(controls).not.toContain("DEV Reset");
    expect(controls).toContain('w-[min(20rem,calc(100vw-2rem))]');
    expect(controls).toContain('className="mt-4 flex w-full"');
  });

  it("shows one success toast only after lifecycle action confirmation and keeps known validation inline", () => {
    expect(controls).toContain('mode === "schedule-initial" ? "Initial meeting scheduled successfully."');
    expect(controls).toContain('mode === "complete-session" ? "Session completed and next Session scheduled."');
    expect(controls).toContain('mode === "complete-program" ? "Counseling program completed successfully."');
    expect(controls).toContain('mode === "close-case" ? "Counseling case closed."');
    expect(controls).toContain('"Follow-up meeting scheduled successfully."');
    expect(controls).toContain('"Both partners must submit Homework. Admin or Super Admin may type OVERRIDE to continue."');
    expect(controls).toContain('"OVERRIDE is only accepted when required Homework is incomplete."');
    expect(controls).toContain('"Choose a published next Session."');
    expect(controls).toContain('"Select a valid reason for closing this counseling case."');
    expect(controls).toContain('else {\n        showSuccessToast(successMessage(open!));\n        close();');
  });

  it("does not toast when a sheet is canceled and retains validation and pending guards", () => {
    const close = controls.slice(controls.indexOf("const close = () =>"), controls.indexOf("const openMode ="));
    expect(close).not.toContain("showSuccessToast");
    expect(controls).toContain("if (validation.dateError || validation.timeError || !validation.time) {");
    expect(controls).toContain("return;\n      }\n      formData.set(\"date\", validation.date)");
    expect(controls).toContain("disabled={pending || ((open === \"complete-initial\"");
  });

  it("retains explicit final-session completion and server lifecycle action selection", () => {
    expect(controls).toContain('isAuthored ? isFinalSession ? "complete-program" : "complete-session"');
    expect(controls).toContain("completeCounselingProgram");
    expect(controls).toContain("completeSessionScheduleNext");
  });

  it("shows an unscheduled Initial Meeting as a full-width standalone primary action", () => {
    expect(controls).toContain('? meeting ? "complete-initial" : "schedule-initial"');
    expect(controls).toContain('? meeting ? "Schedule Next Session" : "Schedule Initial Meeting"');
    expect(controls).toContain('hasSecondaryActions ? "rounded-l-md text-left" : "rounded-md text-center inline-flex items-center justify-center"');
    expect(controls).toContain('{hasSecondaryActions ? <DropdownMenu>');
    expect(controls).toContain('onClick={() => openMode(primaryMode)}');
    expect(controls).toContain('"schedule-initial": "Schedule Initial Meeting"');
  });

  it("shows a blocked authored progression state without unusable controls or an executable submit action", () => {
    expect(controls).toContain('const nextSessionUnavailable = open === "complete-session" && card.publishedSessions.length === 0');
    expect(controls).toContain('if (nextSessionUnavailable) return;');
    expect(controls).toContain('open === "complete-session" && nextSessionUnavailable ? <div role="status"');
    expect(controls).toContain('<p className="text-sm font-semibold text-amber-900">Next Session</p>');
    expect(controls).toContain("No eligible published next Session is currently available.");
    expect(controls).toContain("Publish another Session before this Session can be completed.");
    expect(controls).toContain('(open === "complete-initial" || open === "complete-session" && !nextSessionUnavailable) ? <>');
    expect(controls).toContain('!nextSessionUnavailable && (open !== "complete-session" || homeworkComplete || overrideValid)');
    expect(controls).toContain('{!nextSessionUnavailable ? <button disabled=');
    expect(controls).toContain('<section aria-label="Homework status"');
  });

  it("keeps the normal next-Session selector and scheduling fields for eligible authored progression", () => {
    expect(controls).toContain('open === "complete-session" && !nextSessionUnavailable) ? <>');
    expect(controls).toContain('<Select required value={sessionId} onValueChange={selectSession}>');
    expect(controls).toContain('<DatePicker label="Meeting date" value={meetingDate} required');
    expect(controls).toContain('<TimeInput');
    expect(controls).toContain(': open === "complete-session"\n          ? completeSessionScheduleNext');
  });

  it("keeps the explicitly final Session on the separate Complete Program flow", () => {
    expect(controls).toContain(': isAuthored ? isFinalSession ? "complete-program" : "complete-session" : null');
    expect(controls).toContain(': isAuthored ? isFinalSession ? "Complete Program" : "Schedule Next Session" : null');
    expect(controls).toContain(': open === "complete-program"\n          ? completeCounselingProgram');
    expect(controls).toContain('open === "complete-session" || open === "complete-program" ? <section aria-label="Homework status"');
    expect(controls).toContain('open !== "complete-program" && open !== "close-case" && !nextSessionUnavailable');
  });

  it("keeps resend context scoped to the current meeting and actual partner identities", () => {
    expect(controls).toContain("partners={partners}");
    expect(controls).toContain("deliveries={deliveries}");
    expect(controls).toContain("meetingId={meeting.id}");
    expect(controls).toContain("MeetingNotificationResendMenuItems");
    expect(controls).toContain('openMode(card.state.kind === "initial" ? "reschedule-initial" : "reschedule-meeting")');
  });

  it("keeps Admin and care-team action authorization in the existing server actions", () => {
    expect(actions).toContain('export async function completeInitialMeeting');
    expect(actions).toContain('export async function completeSessionScheduleNext');
    expect(actions).toContain('export async function closeCounselingCaseIncomplete');
    expect(actions).toContain('export async function rescheduleSessionMeeting');
  });

  it("keeps next Session selection visible while presenting a compact Homework gate and deferring scheduling", () => {
    expect(controls).toContain('aria-label="Homework status"');
    expect(controls).toContain("Homework must be completed first");
    expect(controls).toContain("Both partners need to submit their required Homework before you can complete this Session.");
    expect(controls).toContain("homeworkProgressLabel(partner.status)");
    expect(controls).toContain('partners.find((item) => item.id === partner.profileId)?.firstName');
    expect(controls).not.toContain("Outstanding Homework:");
    expect(controls).toContain('<Select required value={sessionId} onValueChange={selectSession}>');
    expect(controls).toContain('open !== "complete-session" || homeworkComplete || overrideValid');
    expect(controls).toContain('((open === "complete-session" || open === "complete-program") && homeworkBlocked && (!card.isAdmin || !overrideValid))');
    expect(controls).toContain("homeworkRequired = Boolean(card.state.caseSession?.homeworkAssignmentRevisionId)");
    expect(controls).toContain("No Homework is required for this Session.");
  });

  it("reveals Admin override only after expanding its secondary disclosure and preserves exact server confirmation", () => {
    expect(controls).toContain('import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"');
    expect(controls).toContain('<CollapsibleTrigger type="button" className="flex min-h-11 w-full cursor-pointer items-center justify-between');
    expect(controls).toContain('<span className="text-sm font-semibold text-text-primary">Admin override</span>');
    expect(controls).toContain('<span className="text-xs font-normal text-text-muted">Continue without completed Homework.</span>');
    expect(controls).toContain("bg-surface-muted px-3 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:bg-surface-muted");
    expect(controls).toContain("data-[state=open]:bg-sidebar-accent");
    expect(controls).toContain('CollapsibleContent className="mt-1 grid gap-2 rounded-md bg-surface-muted p-3"');
    expect(controls).toContain('<ChevronDown aria-hidden="true" className="size-4 shrink-0 text-text-muted transition-transform data-[state=open]:rotate-180" />');
    expect(controls).toContain("Continue without completed Homework. Outstanding Homework will remain incomplete.");
    expect(controls).toContain('name="overrideConfirmation"');
    expect(controls).toContain('overrideConfirmation === "OVERRIDE"');
    expect(controls).toContain('if (!expanded) setOverrideConfirmation("")');
    expect(actions).toContain('override_confirmation: isAdmin ? overrideConfirmation ?? undefined : undefined');
    expect(controls).toContain('homeworkBlocked && card.isAdmin ? <Collapsible');
    expect(controls).toContain('homeworkBlocked && (!card.isAdmin || !overrideValid)');
    expect(controls).toContain('open !== "complete-session" || homeworkComplete || overrideValid');
    expect(controls).not.toContain("does not submit or change either partner’s Homework");
  });

  it("renders the authored Session number supplied by the canonical ranked projection", () => {
    expect(controls).toContain("Session {session.number}: {session.title}");
    expect(controls).not.toContain("actualSequence}");
  });

  it("uses Admin recommendations as optional defaults and keeps selected content in the existing scheduling forms", () => {
    expect(controls).toContain('import { Checkbox } from "@/components/ui/checkbox"');
    expect(controls).toContain("recommendedSessionContentIds(initialSession?.content ?? [])");
    expect(controls).toContain("recommendedSessionContentIds(nextSession?.content ?? [])");
    expect(controls).toContain("recommendedSessionContentIds(selectedSessionContent)");
    expect(controls).toContain("Assign Session Content");
    expect(controls).toContain("Restore Defaults");
    expect(controls).toContain('name="materialBlockId"');
    expect(controls).toContain("toggleSessionContentId(current, item.id, nextChecked === true)");
    expect(controls).toContain("Select at least one Page or Resource to assign.");
    expect(controls).toContain("selectedMaterialBlockIds.length === 0");
    expect(actions).toContain('formData.getAll("materialBlockId")');
    expect(actions).toContain("target_selected_material_block_ids: materialBlockIds");
  });

  it("keeps the selected count and Restore Defaults outside the keyboard-scrollable content list", () => {
    expect(controls).toContain('tabIndex={sessionContentListNeedsScroll(selectedSessionContent.length) ? 0 : undefined}');
    expect(controls).toContain('"grid max-h-[14.5rem] gap-2 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-primary"');
    expect(controls).toContain('className="flex h-[3.25rem] cursor-pointer items-start gap-3 rounded-md bg-surface-muted px-3 py-2"');
    expect(4 * 3.25 + 3 * 0.5).toBe(14.5);
    expect(controls).toContain('aria-label="Session content options"');
    expect(controls).toContain("{selectedMaterialBlockIds.length} selected");
    expect(controls).toContain("Restore Defaults");
  });
});
