import Image from "next/image";

import { ResonateBrand } from "@/components/navigation/resonate-brand";

import { selectLoginImage } from "./login-images";
import { LoginForm } from "./login-form";

export function LoginPage({ error, next }: { error?: string; next?: string }) {
  const image = selectLoginImage();

  return (
    <main className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(30rem,1.1fr)]">
      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:p-10 lg:bg-sidebar lg:px-16">
        <div className="w-full max-w-md">
          <div className="mb-10"><ResonateBrand /></div>
          <section className="rounded-lg border border-black/[0.04] bg-surface p-6 shadow-[0_1px_2px_rgba(43,45,42,0.04),0_12px_32px_rgba(43,45,42,0.06)] sm:p-8">
            <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Welcome back</p>
            <h1 className="font-heading mt-2 text-3xl font-bold text-text-primary">Sign in to Resonate</h1>
            <p className="mt-3 text-sm leading-6 text-text-muted">Continue caring for marriages with your Resonate workspace.</p>
            {error === "access" ? <p role="alert" className="mt-5 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong">Your account is not configured for workspace access.</p> : null}
            <LoginForm next={next} />
            <p className="mt-6 text-sm leading-6 text-text-muted">Resonate workspaces are available by invitation. Contact your ministry administrator if you need access.</p>
          </section>
        </div>
      </section>
      <section className="relative hidden min-h-screen overflow-hidden lg:block">
        <Image
          src={image.src}
          alt={image.alt}
          aria-hidden="true"
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 0px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-background/15" />
      </section>
    </main>
  );
}
