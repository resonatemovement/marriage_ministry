"use client";

import { useState, useTransition } from "react";
import { Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { updateCouplePartnerGender } from "./detail-actions";

export function PartnerGenderEditor({ coupleGroupId, profileId, name, gender }: { coupleGroupId: string; profileId: string; name: string; gender: "male" | "female" | null }) {
  const [selectedGender, setSelectedGender] = useState(gender ?? "");
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function save() {
    if (selectedGender !== "male" && selectedGender !== "female") return;
    const formData = new FormData();
    formData.set("coupleGroupId", coupleGroupId);
    formData.set("profileId", profileId);
    formData.set("gender", selectedGender);
    startTransition(async () => {
      const result = await updateCouplePartnerGender(formData);
      if ("error" in result) {
        showErrorToast(result.error);
        return;
      }
      showSuccessToast("Partner gender updated.");
      setOpen(false);
      router.refresh();
    });
  }

  return <>
    <button type="button" onClick={() => { setSelectedGender(gender ?? ""); setOpen(true); }} aria-label={`Edit gender for ${name}`} className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted">
      <Pencil className="size-4" aria-hidden="true" />Edit gender
    </button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Edit partner gender</SheetTitle>
          <SheetDescription>Update the gender recorded for {name}.</SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 p-6">
          <label htmlFor={`partner-gender-${profileId}`} className="text-sm font-medium text-text-primary">Gender</label>
          <Select value={selectedGender} onValueChange={setSelectedGender}>
            <SelectTrigger id={`partner-gender-${profileId}`} aria-label={`Gender for ${name}`}>
              <SelectValue placeholder="Choose gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted">Cancel</button>
            <button type="button" onClick={save} disabled={pending || selectedGender === gender || !selectedGender} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="size-4" aria-hidden="true" />{pending ? "Saving..." : "Save gender"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
