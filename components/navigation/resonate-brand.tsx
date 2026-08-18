export function ResonateBrand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-primary text-sm font-bold text-white">
        R
        <span className="absolute inset-x-0 bottom-0 h-1 bg-brand-accent" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold uppercase tracking-wider text-sidebar-foreground">Resonate</p>
        <p className="truncate text-xs text-sidebar-muted">Marriage Ministry</p>
      </div>
    </div>
  );
}
