export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="w-full max-w-md rounded-lg border border-black/[0.04] bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04),0_12px_32px_rgba(43,45,42,0.06)] sm:p-8">
        <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Resonate</p>
        <h1 className="font-heading mt-2 text-2xl font-bold text-text-primary">Password recovery</h1>
        <p className="mt-3 text-sm leading-6 text-text-muted">Password recovery will be available soon. Please contact your ministry administrator for help accessing your workspace.</p>
        <a href="/login" className="mt-6 inline-flex h-11 items-center rounded-md bg-brand-primary px-4 text-sm font-bold text-white transition hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">Back to sign in</a>
      </section>
    </main>
  );
}
