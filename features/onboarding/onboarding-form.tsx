"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { completeOnboarding, saveOnboardingProfile } from "./actions";
import { ProfilePhotoField } from "./profile-photo-field";
import { PhotoHandoff } from "./photo-handoff";
import { formatPhoneInput } from "./phone";
import { validateOnboarding } from "./validation";

type Props = { firstName: string; lastName: string; phone: string; email: string; campus: string; profileId: string; hasPhoto: boolean; photoUrl: string | null };

export function OnboardingForm({ firstName, lastName, phone, email, campus, profileId, hasPhoto, photoUrl }: Props) {
  const router = useRouter();
  const [fields, setFields] = useState({ firstName, lastName, phone: formatPhoneInput(phone) });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [photo, setPhoto] = useState({ saved: hasPhoto, url: photoUrl });

  function update(field: keyof typeof fields, value: string) {
    setFields((current) => ({ ...current, [field]: field === "phone" ? formatPhoneInput(value) : value }));
    setSaved(false); setError("");
  }

  function persistDraft() {
    const phoneError = fields.phone.trim() && validateOnboarding({ firstName: "Valid", lastName: "Valid", phone: fields.phone }).phone;
    if (phoneError) return setError("Enter a valid phone number.");
    if (!fields.firstName.trim() && !fields.lastName.trim() && !fields.phone.trim()) return;
    startTransition(async () => {
      const result = await saveOnboardingProfile(fields);
      if (!result.success) return setError(result.error);
      setSaved(true);
    });
  }

  function finish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validateOnboarding(fields);
    if (Object.keys(errors).length) return setError(Object.values(errors)[0]!);
    startTransition(async () => {
      const draft = await saveOnboardingProfile(fields);
      if (!draft.success) return setError(draft.error);
      const result = await completeOnboarding();
      if (!result.success) return setError(result.error);
      router.replace("/workspace"); router.refresh();
    });
  }

  const fieldClass = "mt-2 h-11 w-full rounded-md border border-border bg-white px-3 text-sm text-text-primary outline-none transition focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20";

  return <form onSubmit={finish} noValidate className="mt-8 space-y-5">
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="text-sm font-medium text-text-primary">First name<input value={fields.firstName} onChange={(event) => update("firstName", event.target.value)} onBlur={persistDraft} className={fieldClass} /></label>
      <label className="text-sm font-medium text-text-primary">Last name<input value={fields.lastName} onChange={(event) => update("lastName", event.target.value)} onBlur={persistDraft} className={fieldClass} /></label>
    </div>
    <label className="block text-sm font-medium text-text-primary">Email<input value={email} readOnly className={`${fieldClass} cursor-not-allowed bg-surface-muted text-text-muted`} /></label>
    <label className="block text-sm font-medium text-text-primary">Phone number<input value={fields.phone} onChange={(event) => update("phone", event.target.value)} onBlur={persistDraft} inputMode="tel" autoComplete="tel" className={fieldClass} /></label>
    <label className="block text-sm font-medium text-text-primary">Campus<input value={campus} readOnly className={`${fieldClass} cursor-not-allowed bg-surface-muted text-text-muted`} /></label>
    <ProfilePhotoField profileId={profileId} hasPhoto={photo.saved} photoUrl={photo.url} onSaved={(url) => { setPhoto({ saved: true, url }); router.refresh(); }} />
    <PhotoHandoff profileId={profileId} onCompleted={(url) => { setPhoto({ saved: true, url }); router.refresh(); }} />
    {error ? <p role="alert" className="mt-2 text-sm text-danger-strong">{error}</p> : null}
    {saved ? <p role="status" className="mt-2 text-sm text-success-strong">Saved. Complete onboarding when you are ready.</p> : null}
    <button type="submit" disabled={pending || !photo.saved || Object.keys(validateOnboarding(fields)).length > 0} className="h-11 w-full rounded-md bg-sidebar-active px-4 text-sm font-bold text-white disabled:opacity-60">{pending ? "Saving..." : "Complete onboarding"}</button>
  </form>;
}
