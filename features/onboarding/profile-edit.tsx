"use client";

import { useState, useTransition } from "react";

import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { updateOwnProfile } from "./management";
import { formatPhoneInput } from "./phone";
import { validateOnboarding } from "./validation";
import { ProfilePhotoField } from "./profile-photo-field";

type ProfileEditProps = {
  profileId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  campus: string;
  hasPhoto: boolean;
  photoUrl: string | null;
};

export function ProfileEdit({ profileId, firstName, lastName, phone, email, campus, hasPhoto, photoUrl }: ProfileEditProps) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Partial<Record<"firstName" | "lastName" | "phone", string>>>({});
  const [photoMessage, setPhotoMessage] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const validationErrors = validateOnboarding({
      firstName: String(data.get("firstName") ?? ""),
      lastName: String(data.get("lastName") ?? ""),
      phone: String(data.get("phone") ?? ""),
    });
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    startTransition(async () => {
      try {
        const result = await updateOwnProfile(data);
        if ("error" in result) {
          showErrorToast("Unable to update profile. Please try again.");
          return;
        }
        showSuccessToast("Profile updated successfully.");
      } catch {
        showErrorToast("Unable to update profile. Please try again.");
      }
    });
  }

  return <form noValidate className="grid gap-6 rounded-lg border border-border bg-surface p-6 lg:grid-cols-[minmax(0,2fr)_minmax(16rem,1fr)]" onSubmit={submit}>
    <div className="grid min-w-0 content-start gap-4 lg:grid-cols-2">
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">First name<input name="firstName" defaultValue={firstName} aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? "profile-first-name-error" : undefined} className="min-h-10 w-full min-w-0 rounded-md border border-border bg-white px-3" />{errors.firstName ? <span id="profile-first-name-error" role="alert" className="text-sm font-normal text-danger-strong">{errors.firstName}</span> : null}</label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">Last name<input name="lastName" defaultValue={lastName} aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? "profile-last-name-error" : undefined} className="min-h-10 w-full min-w-0 rounded-md border border-border bg-white px-3" />{errors.lastName ? <span id="profile-last-name-error" role="alert" className="text-sm font-normal text-danger-strong">{errors.lastName}</span> : null}</label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">Phone<input name="phone" defaultValue={formatPhoneInput(phone)} inputMode="tel" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "profile-phone-error" : undefined} className="min-h-10 w-full min-w-0 rounded-md border border-border bg-white px-3" />{errors.phone ? <span id="profile-phone-error" role="alert" className="text-sm font-normal text-danger-strong">{errors.phone}</span> : null}</label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium">Email<input value={email} readOnly className="min-h-10 w-full min-w-0 cursor-not-allowed rounded-md border border-border bg-surface-muted px-3 text-text-muted" /></label>
      <label className="grid min-w-0 gap-1.5 text-sm font-medium lg:col-span-2">Campus<input value={campus} readOnly className="min-h-10 w-full min-w-0 cursor-not-allowed rounded-md border border-border bg-surface-muted px-3 text-text-muted" /></label>
    </div>
    <div className="min-w-0"><ProfilePhotoField profileId={profileId} hasPhoto={hasPhoto} photoUrl={photoUrl} onSaved={() => setPhotoMessage("Profile photo saved.")} />{photoMessage ? <p role="status" className="mt-2 text-sm text-text-muted">{photoMessage}</p> : null}</div>
    <div className="lg:col-span-2"><button type="submit" disabled={pending} className="min-h-10 w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-fit">{pending ? "Saving..." : "Save profile"}</button></div>
  </form>;
}
