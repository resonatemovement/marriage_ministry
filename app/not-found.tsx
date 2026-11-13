import Link from "next/link";

import { ResonateBrand } from "@/components/navigation/resonate-brand";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12 text-text-primary sm:px-6">
      <section aria-labelledby="not-found-heading" className="w-full max-w-xl rounded-xl border border-border bg-surface p-7 shadow-sm sm:p-10">
        <ResonateBrand />
        <div className="mt-10">
          <h1 id="not-found-heading" className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Page not found</h1>
          <p className="mt-4 text-base leading-7 text-text-muted">We couldn&apos;t find the page you&apos;re looking for. The link may be incorrect or no longer available.</p>
          <Link href="/" aria-label="Return to Resonate home" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-brand-primary px-5 text-sm font-bold text-white transition hover:bg-brand-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary">
            Return to Marriage Ministry
          </Link>
        </div>
      </section>
    </main>
  );
}
