import { GlobalActions } from "@/components/shared/global-actions";

export function DashboardHeader() {
  return (
    <header className="flex min-h-18 items-center justify-between gap-4 border-b border-border bg-surface px-5 py-3 sm:px-8 lg:min-h-24 lg:px-10">
      <div className="min-w-0">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Admin workspace</p>
        <h1 className="font-heading mt-1 truncate text-xl font-bold text-text-primary">Counseling overview</h1>
      </div>
      <GlobalActions className="hidden lg:flex" />
    </header>
  );
}
