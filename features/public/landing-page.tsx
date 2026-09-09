import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarHeart,
  HeartHandshake,
  MessageCircleHeart,
  Sprout,
} from "lucide-react";

import { ResonateBrand } from "@/components/navigation/resonate-brand";

const navigation = [
  { href: "#about", label: "About" },
  { href: "#expect", label: "What to Expect" },
  { href: "#faq", label: "FAQ" },
] as const;

const benefits = [
  { icon: HeartHandshake, title: "Real Support", description: "A caring, confidential environment." },
  { icon: MessageCircleHeart, title: "Practical Guidance", description: "Tools for healthier communication and growth." },
  { icon: Sprout, title: "Faith-Informed", description: "Support grounded in the values of Resonate's Marriage Ministry." },
  { icon: CalendarHeart, title: "For Every Season", description: "Support for pre-engaged, engaged, and married couples." },
] as const;

const steps = [
  { title: "Submit a Request", description: "Tell us about you, your relationship, and the support you're looking for." },
  { title: "Review", description: "Our team reviews your request and determines the appropriate next step." },
  { title: "Get Connected", description: "If moving forward with the program, you'll receive invitations to set up your accounts." },
  { title: "Begin the Journey", description: "Complete onboarding and move forward with the Coach or Counselor you're paired with." },
] as const;

function PublicHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 shadow-[0_1px_8px_rgba(43,45,42,0.04)] backdrop-blur">
      <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Resonate Marriage Ministry home" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary">
          <ResonateBrand />
        </Link>
        <nav aria-label="Primary navigation" className="hidden items-center gap-7 md:flex">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} className="text-sm font-medium text-text-muted transition hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary">
              {item.label}
            </a>
          ))}
        </nav>
        <Link href={signedIn ? "/auth/entry" : "/login"} className="inline-flex min-h-10 items-center justify-center rounded-md border border-brand-primary/25 px-4 text-sm font-bold text-brand-primary transition hover:border-brand-primary hover:bg-info-soft focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-primary">
          {signedIn ? "Go to Workspace" : "Sign In"}
        </Link>
      </div>
    </header>
  );
}

function PublicFooter({ signedIn }: { signedIn: boolean }) {
  return (
    <footer className="border-t border-border bg-sidebar">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-10">
        <ResonateBrand />
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          {navigation.map((item) => <a key={item.href} href={item.href} className="font-medium text-text-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-primary">{item.label}</a>)}
          <Link href={signedIn ? "/auth/entry" : "/login"} className="font-bold text-brand-primary hover:text-info-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-primary">{signedIn ? "Go to Workspace" : "Sign In"}</Link>
        </nav>
      </div>
    </footer>
  );
}

export function MarriageMinistryLandingPage({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <div className="min-h-screen overflow-x-clip bg-background text-text-primary">
      <PublicHeader signedIn={signedIn} />
      <main>
        <section aria-labelledby="hero-heading" className="mx-auto max-w-[90rem] px-3 pt-3 sm:px-5 sm:pt-5 lg:px-8">
          <div className="relative isolate flex min-h-[38rem] overflow-hidden rounded-xl bg-text-primary sm:min-h-[42rem] lg:min-h-[43rem]">
            <Image src="/images/login/couple-04.avif" alt="A couple sharing a warm, quiet moment together" fill priority sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 64px), (min-width: 640px) calc(100vw - 40px), calc(100vw - 24px)" className="object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#1d292d]/90 via-[#1d292d]/62 to-[#1d292d]/16" />
            <div className="relative z-10 flex w-full items-end px-6 py-10 sm:max-w-2xl sm:px-12 sm:py-16 lg:max-w-3xl lg:px-16 lg:py-20">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#d2e7ef]">Marriage Ministry</p>
                <h1 id="hero-heading" className="mt-4 max-w-xl text-5xl font-bold tracking-[-0.04em] text-white sm:text-6xl lg:text-7xl">Stronger Together</h1>
                <p className="mt-5 max-w-xl text-lg leading-8 text-white/90 sm:text-xl">A safe and supportive place for couples to grow, heal, and build a healthier future together—through every season of life.</p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link href="/request-counseling" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-primary px-5 text-sm font-bold text-white shadow-sm transition hover:bg-info-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">Request Counseling <ArrowRight className="size-4" aria-hidden="true" /></Link>
                  <a href="#about" className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/55 px-5 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">Learn More</a>
                </div>
                <p className="mt-6 text-sm text-white/85">Already participating in the program? <Link href={signedIn ? "/auth/entry" : "/login"} className="font-bold underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">{signedIn ? "Go to your workspace." : "Sign in here."}</Link></p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Marriage Ministry benefits" className="mx-auto max-w-7xl px-5 py-14 sm:px-8 lg:px-10 lg:py-18">
          <div className="grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map(({ icon: Icon, title, description }) => <article key={title} className="border-l-2 border-brand-secondary pl-4"><Icon className="mb-4 size-5 text-brand-primary" aria-hidden="true" /><h2 className="text-lg font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-text-muted">{description}</p></article>)}
          </div>
        </section>

        <section id="about" aria-labelledby="about-heading" className="scroll-mt-24 bg-surface-muted py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-10">
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sidebar shadow-[0_12px_32px_rgba(43,45,42,0.08)]"><Image src="/images/login/couple-02.avif" alt="A couple talking together in a calm setting" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-center" /></div>
            <div className="max-w-xl"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-secondary">About the Program</p><h2 id="about-heading" className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">You don&apos;t have to do this alone.</h2><p className="mt-5 text-base leading-8 text-text-muted">Resonate Marriage Ministry offers lay counseling and support for couples who want to strengthen their relationship, navigate challenges, and take meaningful next steps together.</p><p className="mt-4 text-base leading-8 text-text-muted">The intake process helps us understand your needs and determine whether Marriage Ministry support or a professional referral is the appropriate next step.</p></div>
          </div>
        </section>

        <section id="expect" aria-labelledby="expect-heading" className="scroll-mt-24 mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10">
          <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-secondary">What to Expect</p><h2 id="expect-heading" className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">A simple path from request to support.</h2></div>
          <ol className="mt-12 grid gap-8 md:grid-cols-4 md:gap-5">
            {steps.map((step, index) => <li key={step.title} className="relative border-l border-border pl-7 md:border-l-0 md:pl-0 md:pt-12 before:absolute before:left-[-0.5rem] before:top-0 before:grid before:size-8 before:place-items-center before:rounded-full before:bg-brand-primary before:text-sm before:font-bold before:text-white before:content-[counter(item)] md:before:left-0 md:before:top-0 md:after:absolute md:after:left-8 md:after:right-0 md:after:top-4 md:after:h-px md:after:bg-border md:last:after:hidden" style={{ counterIncrement: "item", counterReset: index === 0 ? "item 0" : undefined }}><h3 className="text-lg font-bold">{step.title}</h3><p className="mt-2 text-sm leading-6 text-text-muted">{step.description}</p></li>)}
          </ol>
        </section>

        <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-24 bg-surface-muted py-16 sm:py-20"><div className="mx-auto grid max-w-7xl gap-9 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-10"><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand-secondary">FAQ</p><h2 id="faq-heading" className="mt-3 text-4xl font-bold tracking-[-0.03em] sm:text-5xl">A welcoming place to begin.</h2></div><div className="space-y-6"><article><h3 className="text-lg font-bold">Who is Marriage Ministry for?</h3><p className="mt-2 leading-7 text-text-muted">Marriage Ministry is here for pre-engaged, engaged, and married couples seeking thoughtful relationship support.</p></article><article className="border-t border-border pt-6"><h3 className="text-lg font-bold">What happens after I submit a request?</h3><p className="mt-2 leading-7 text-text-muted">Our team reviews your request and helps identify the most appropriate next step for your situation.</p></article></div></div></section>

        <section className="mx-auto max-w-[90rem] px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-8"><div className="relative isolate overflow-hidden rounded-xl bg-text-primary px-6 py-16 sm:px-12 sm:py-20 lg:px-20 lg:py-24"><Image src="/images/login/couple-05.avif" alt="A couple walking together outdoors" fill sizes="(min-width: 1440px) 1344px, (min-width: 1024px) calc(100vw - 64px), 100vw" className="object-cover object-center" /><div className="absolute inset-0 bg-[#1d292d]/75" /><div className="relative z-10 max-w-2xl"><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#d2e7ef]">Ready to Take the Next Step?</p><h2 className="mt-3 text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">A healthier, more connected future is possible.</h2><p className="mt-5 text-lg leading-8 text-white/90">Start with a counseling request. It only takes a few minutes and helps our team understand how best to support you.</p><div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center"><Link href="/request-counseling" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-brand-primary px-5 text-sm font-bold text-white transition hover:bg-info-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">Request Counseling <ArrowRight className="size-4" aria-hidden="true" /></Link><Link href={signedIn ? "/auth/entry" : "/login"} className="text-sm font-bold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-white">{signedIn ? "Go to Workspace" : "Already participating? Sign In"}</Link></div></div></div></section>
      </main>
      <PublicFooter signedIn={signedIn} />
    </div>
  );
}
