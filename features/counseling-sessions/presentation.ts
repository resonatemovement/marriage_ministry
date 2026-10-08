import type { SessionCardState } from "./model";
import type { CounselingSessionPartner } from "./queries";

export const counselingSessionsGridClassName = "mt-4 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2";
export const counselingSessionsWorkspaceClassName = "grid gap-x-6 gap-y-4 xl:grid-cols-[minmax(0,1fr)_280px]";
export const counselingSessionsHeaderClassName = "xl:col-start-1 xl:row-start-1";
export const counselingSessionsContentClassName = "xl:col-start-1 xl:row-start-2";
export const counselingSessionsRailClassName = "order-3 min-w-0 xl:order-none xl:col-start-2 xl:row-start-2";
export const sessionCardContainerClassName = "relative flex h-full flex-col overflow-hidden p-5 transition-all duration-150 has-[>a:hover]:-translate-y-px has-[>a:hover]:border-brand-primary/35 has-[>a:hover]:shadow-[0_4px_10px_rgba(43,45,42,0.08),0_12px_28px_rgba(43,45,42,0.07)] has-[>a:focus-visible]:border-brand-primary/60 has-[>a:focus-visible]:ring-2 has-[>a:focus-visible]:ring-brand-primary/35";
export const sessionCardNavigationClassName = "absolute inset-0 z-0 cursor-pointer rounded-lg transition-colors hover:bg-info-soft/35 focus:outline-none focus-visible:bg-info-soft/45";
export const sessionCardActionClassName = "relative z-10 mt-auto pt-5";

export function counselingCaseHref(caseId: string) {
  return `/workspace/cases/${caseId}`;
}

export function sessionCardNavigation(caseId: string, coupleName: string) {
  return { href: counselingCaseHref(caseId), label: `Open counseling case for ${coupleName}` };
}

export function counselingSessionPresentation(state: SessionCardState) {
  return {
    statusLabel: state.kind === "session" && state.action === "close-case" ? "FINAL SESSION" : state.label,
    homework: state.kind === "initial" ? null : state.action === "reschedule-meeting" ? "Awaiting Completion" : state.action === "schedule-next" || state.action === "close-case" ? "Completed" : null,
    action: state.action,
    sessionTitle: state.session?.title ?? state.detail,
    progress: state.progress,
  };
}

export function couplePhotoSlots(partners: readonly CounselingSessionPartner[]) {
  return Array.from({ length: 2 }, (_, index) => partners[index] ?? null);
}
