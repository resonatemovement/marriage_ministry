import { ResonateBrand } from "@/components/navigation/resonate-brand";

export function PhotoHandoffUnavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-text-primary sm:px-6 sm:py-14">
      <section aria-labelledby="photo-link-heading" className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
        <ResonateBrand />
        <div className="mt-8">
          <h1 id="photo-link-heading" className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">Photo link unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-text-muted sm:text-base sm:leading-7">This photo link has expired or is no longer valid. Return to your desktop and generate a new QR code to continue.</p>
        </div>
      </section>
    </main>
  );
}
