"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { completeIncompleteProfile, recoverIncompleteProfile, uploadAdminProfilePhoto } from "./management";
import { formatPhoneInput } from "./phone";
import { PhoneInput } from "./phone-input";
import { profilePhotoSourceError } from "./profile-photo-contract";
import { photoSelectionFeedback, photoUploadFailed, photoUploadStarted, photoUploadSucceeded, PHOTO_UPLOAD_SUCCESS } from "./photo-feedback";

type Campus = { id: string; name: string; active: boolean };
type Props = { profileId: string; firstName: string; lastName: string; phone: string | null; campusId: string | null; email: string | null; missing: string[]; campuses: Campus[] };

export function AdminOnboardingRecovery({ profileId, firstName, lastName, phone, campusId, email, missing, campuses }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState(photoUploadStarted());
  const [pending, startTransition] = useTransition();
  const [phoneValue, setPhoneValue] = useState(formatPhoneInput(phone ?? ""));
  const photoInput = useRef<HTMLInputElement>(null);

  const requirementsComplete = missing.length === 0;

  function selectPhoto(file: File | null) {
    setSelectedPhoto(file);
    setPhotoError(profilePhotoSourceError(file));
    setPhotoFeedback(photoSelectionFeedback(""));
    setError("");
  }

  async function uploadPhoto(form: HTMLFormElement) {
    const sourceError = profilePhotoSourceError(selectedPhoto);
    setPhotoError(sourceError);
    if (sourceError || !selectedPhoto) return;
    setError("");
    setPhotoFeedback(photoUploadStarted());
    const data = new FormData(form);
    data.set("photo", selectedPhoto);
    startTransition(async () => {
      const result = await uploadAdminProfilePhoto(data);
      if ("error" in result) {
        setPhotoFeedback(photoUploadFailed(result.error));
        return;
      }
      setPhotoFeedback(photoUploadSucceeded());
      setSelectedPhoto(null);
      if (photoInput.current) photoInput.current.value = "";
      setError("");
      router.refresh();
    });
  }

  return <section className="mt-5 min-w-0 rounded-md border border-warning-strong/25 bg-warning-soft p-4">
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-sm font-semibold text-text-primary">{requirementsComplete ? "Onboarding ready to complete" : "Onboarding incomplete"}</p>{requirementsComplete ? <p className="mt-1 text-sm text-text-muted">All required onboarding fields are present.</p> : <p className="mt-1 text-sm text-text-muted">Missing: {missing.join(", ")}</p>}<p className="mt-1 text-xs text-text-muted">Email is read-only: {email ?? "Not provided"}</p></div>
      {!requirementsComplete ? <button type="button" onClick={() => setOpen((value) => !value)} className="min-h-9 rounded-md bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white">{open ? "Close" : "Recover onboarding"}</button> : null}
    </div>
    {open && !requirementsComplete ? <>
      <form className="mt-4 grid min-w-0 gap-3" onSubmit={(event) => { event.preventDefault(); setError(""); const data = new FormData(event.currentTarget); startTransition(async () => { const result = await recoverIncompleteProfile(data); if ("error" in result) return setError(result.error); setError("Details saved. Supply the required photo, then complete onboarding."); }); }}>
        <input type="hidden" name="profileId" value={profileId} />
        <label className="grid min-w-0 gap-1 text-sm font-medium">First name<input name="firstName" defaultValue={firstName} required className="min-h-10 w-full min-w-0 rounded-md border border-border bg-white px-3" /></label>
        <label className="grid min-w-0 gap-1 text-sm font-medium">Last name<input name="lastName" defaultValue={lastName} required className="min-h-10 w-full min-w-0 rounded-md border border-border bg-white px-3" /></label>
        <label className="grid min-w-0 gap-1 text-sm font-medium">Phone<PhoneInput name="phone" value={phoneValue} onChange={setPhoneValue} required className="min-h-10 w-full min-w-0 rounded-md border border-border bg-white px-3" /></label>
        <div className="grid min-w-0 gap-1 text-sm font-medium"><span>Campus</span><Select name="campusId" defaultValue={campusId ?? undefined}><SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Select campus" /></SelectTrigger><SelectContent>{campuses.filter((campus) => campus.active).map((campus) => <SelectItem key={campus.id} value={campus.id}>{campus.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="grid min-w-0 gap-1 text-sm font-medium">
          <span>Profile photo</span>
          <input ref={photoInput} name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)} className="sr-only" disabled={pending} />
          {photoFeedback.success ? <p role="status" className="text-sm text-success-strong">{PHOTO_UPLOAD_SUCCESS}</p> : selectedPhoto ? <><p className="min-w-0 truncate text-sm text-text-muted" title={selectedPhoto.name}>{selectedPhoto.name}</p><div className="flex min-w-0 flex-wrap gap-2"><label className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-brand-primary bg-white px-3 py-1.5 text-sm font-semibold text-brand-primary"><span>Change photo</span><input aria-label="Change photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)} className="sr-only" disabled={pending} /></label><button type="button" disabled={pending} onClick={(event) => { const form = event.currentTarget.form; if (form) void uploadPhoto(form); }} className="min-h-9 w-full rounded-md bg-sidebar-active px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto">{pending ? "Uploading..." : "Upload photo"}</button></div></> : <button type="button" onClick={() => photoInput.current?.click()} className="inline-flex min-h-10 w-fit items-center rounded-md bg-white px-3 text-sm font-semibold text-brand-primary ring-1 ring-border">Choose photo</button>}
          {photoError ? <p role="alert" className="text-sm text-danger-strong">{photoError}</p> : null}
        </div>
        <p className="text-xs text-text-muted">Roles, memberships, assignments, campus scope, and email cannot be changed here.</p>
        {error || photoFeedback.error ? <p role="alert" className="text-sm text-danger-strong">{error || photoFeedback.error}</p> : null}
        <button type="submit" disabled={pending} className="min-h-10 w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Saving..." : "Save recovery fields"}</button>
      </form>
    </> : null}
    <button type="button" disabled={pending || !requirementsComplete} onClick={() => startTransition(async () => { const result = await completeIncompleteProfile(profileId); setError("error" in result ? result.error : "Onboarding completed."); if (!("error" in result)) router.refresh(); })} className="mt-3 w-full rounded-md border border-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary disabled:opacity-60 sm:w-auto">{requirementsComplete ? "Complete onboarding" : "Complete onboarding after required fields are present"}</button>
    {error && !open ? <p role="alert" className="mt-3 text-sm text-danger-strong">{error}</p> : null}
  </section>;
}
