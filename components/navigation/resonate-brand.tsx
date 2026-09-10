import Image from "next/image";

export function ResonateBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image src="/images/logo.svg" alt="Resonate" width={36} height={40} className="h-10 w-auto shrink-0" priority />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold uppercase tracking-wider text-sidebar-foreground">Resonate</p>
        <p className="truncate text-xs text-sidebar-muted">Marriage Ministry</p>
      </div>
    </div>
  );
}
