import { cn } from "@/lib/utils";

type CapacityTone = "blue" | "green";

const toneStyles: Record<CapacityTone, string> = {
  blue: "text-brand-primary",
  green: "text-brand-secondary",
};

export function CapacityRing({
  label,
  available,
  total,
  percentage,
  tone,
}: {
  label: string;
  available: number;
  total: number;
  percentage: number;
  tone: CapacityTone;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center text-center">
      <div
        className="relative size-31 sm:size-34"
        role="img"
        aria-label={`${label}: ${available} of ${total} available, ${percentage}%`}
      >
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r="42"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            className="text-surface-muted"
          />
          <circle
            cx="50"
            cy="50"
            r="42"
            pathLength="100"
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="100"
            strokeDashoffset={100 - percentage}
            className={cn("transition-none", toneStyles[tone])}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-heading text-2xl font-extrabold text-text-primary">{percentage}%</span>
        </div>
      </div>
      <p className="font-heading mt-4 text-sm font-bold text-text-primary">{label}</p>
      <p className="mt-1 text-xs text-text-muted">{available} of {total} available</p>
    </div>
  );
}
