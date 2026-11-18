import { Badge } from "@/components/ui/badge";

export const assessmentViewResultsClassName = "inline-flex w-fit items-center text-sm leading-5 font-semibold text-brand-primary underline-offset-4 transition hover:underline focus-visible:underline";

export type AssessmentSummaryParticipant = {
  id: string;
  name: string;
  status?: string;
  primaryResults?: string[];
};

export function AssessmentSummary({
  title,
  requirement,
  progress,
  participants,
  children,
}: {
  title: string;
  requirement: "Required" | "Optional" | "Available";
  progress?: string;
  participants: AssessmentSummaryParticipant[];
  children?: React.ReactNode;
}) {
  return <div>
    <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-heading min-w-0 text-base font-bold text-text-primary">{title}</h3><Badge className={requirement === "Required" ? "bg-info-soft text-info-strong" : "bg-surface-muted text-text-muted"}>{requirement}</Badge></div>
    {progress ? <p className="mt-2 text-sm text-text-secondary">{progress}</p> : null}
    {participants.length ? <ul className="mt-2 space-y-2" aria-label={`${title} participant progress`}>
      {participants.map((participant) => <li key={participant.id} className="rounded-md bg-surface-muted px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="min-w-0 font-semibold text-text-primary">{participant.name}</span>{participant.status ? <span className="text-text-secondary">{participant.status}</span> : null}</div>
        {participant.primaryResults?.length ? <p className="mt-1 break-words text-text-secondary">{participant.primaryResults.join(", ")}</p> : null}
      </li>)}
    </ul> : null}
    {children}
  </div>;
}
