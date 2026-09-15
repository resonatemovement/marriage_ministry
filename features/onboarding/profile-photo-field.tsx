"use client";

import { ChangeEvent, useState } from "react";
import Image from "next/image";

import { createBrowserSupabaseClient } from "@/lib/supabase/client";

import { uploadOwnProfilePhoto } from "./actions";
import { profilePhotoPath, profilePhotoSourceError } from "./profile-photo-contract";

type Props = { profileId: string; hasPhoto: boolean; photoUrl: string | null; onSaved: (url: string) => void };

export function ProfilePhotoField({ profileId, hasPhoto, photoUrl, onSaved }: Props) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true); setError("");
    try {
      const sourceError = profilePhotoSourceError(file);
      if (sourceError) throw new Error(sourceError);
      const data = new FormData();
      data.set("photo", file);
      const result = await uploadOwnProfilePhoto(data);
      if (!result.success) throw new Error(result.error);
      const { data: signed } = await createBrowserSupabaseClient().storage.from("profile-photos").createSignedUrl(profilePhotoPath(profileId), 3600);
      onSaved(signed?.signedUrl ?? "");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The image could not be uploaded."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  return <section className="rounded-md border border-border bg-surface-muted p-4"><p className="text-sm font-semibold text-text-primary">Profile photo</p>{hasPhoto && photoUrl ? <Image src={photoUrl} alt="Your saved profile" width={96} height={96} unoptimized className="mt-3 size-24 rounded-full object-cover" /> : null}<p className="mt-1 text-sm text-text-muted">{hasPhoto ? "Photo saved. You can replace it before completing onboarding." : "A square profile photo is required."}</p><div className="mt-3 flex flex-wrap gap-2"><label className="inline-flex h-10 cursor-pointer items-center rounded-md bg-white px-3 text-sm font-semibold text-brand-primary ring-1 ring-border"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={upload} className="sr-only" disabled={busy} />{busy ? "Preparing..." : hasPhoto ? "Change photo" : "Upload photo"}</label></div>{error ? <p role="alert" className="mt-2 text-sm text-danger-strong">{error}</p> : null}</section>;
}
