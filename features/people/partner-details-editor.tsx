"use client";

import { useState, useTransition } from "react";
import { Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPhoneInput, normalizePhone } from "@/features/onboarding/phone";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { updateCouplePartnerDetails } from "./detail-actions";
import { hasPartnerDetailsChanges, validatePartnerDetails, type PartnerDetailsFields } from "./partner-details-editor-model";

type EditableGender = "male" | "female" | null;
type Field = keyof PartnerDetailsFields;

function fieldsFromProps(firstName: string, lastName: string, phone: string, gender: EditableGender): PartnerDetailsFields {
  return { firstName, lastName, phone: formatPhoneInput(phone), gender: gender ?? "" };
}

export function PartnerDetailsEditor({ coupleGroupId, profileId, firstName, lastName, phone, email, gender }: {
  coupleGroupId: string;
  profileId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  gender: EditableGender;
}) {
  const [values, setValues] = useState(() => fieldsFromProps(firstName, lastName, phone ?? "", gender));
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const original = fieldsFromProps(firstName, lastName, phone ?? "", gender);
  const errors = validatePartnerDetails(values);
  const changed = hasPartnerDetailsChanges(values, original);
  const valid = Object.keys(errors).length === 0;

  function setField(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value as PartnerDetailsFields[typeof field] }));
  }

  function save() {
    if (!valid || !changed) return;
    const data = new FormData();
    data.set("coupleGroupId", coupleGroupId);
    data.set("profileId", profileId);
    data.set("firstName", values.firstName.trim());
    data.set("lastName", values.lastName.trim());
    data.set("phone", normalizePhone(values.phone));
    data.set("gender", values.gender);
    startTransition(async () => {
      const result = await updateCouplePartnerDetails(data);
      if ("error" in result) {
        showErrorToast(result.error);
        return;
      }
      showSuccessToast("Partner details updated.");
      setOpen(false);
      router.refresh();
    });
  }

  function openEditor() {
    setValues(fieldsFromProps(firstName, lastName, phone ?? "", gender));
    setTouched({});
    setOpen(true);
  }

  function fieldError(field: Field) {
    return touched[field] ? errors[field] : undefined;
  }

  return <>
    <button type="button" onClick={openEditor} aria-label={`Edit details for ${[firstName, lastName].filter(Boolean).join(" ")}`} className="mt-4 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted">
      <Pencil className="size-4" aria-hidden="true" />Edit Details
    </button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="overflow-y-auto p-0">
        <SheetHeader className="border-b border-border px-6 py-5">
          <SheetTitle>Edit partner details</SheetTitle>
          <SheetDescription>Update {firstName || "this partner"}&apos;s contact details. Email cannot be changed here.</SheetDescription>
        </SheetHeader>
        <form noValidate className="grid gap-4 p-6" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <label htmlFor={`partner-first-name-${profileId}`} className="grid gap-1.5 text-sm font-medium text-text-primary">First Name
            <Input id={`partner-first-name-${profileId}`} value={values.firstName} maxLength={80} aria-invalid={Boolean(fieldError("firstName"))} aria-describedby={fieldError("firstName") ? `partner-first-name-error-${profileId}` : undefined} onChange={(event) => setField("firstName", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, firstName: true }))} />
            {fieldError("firstName") ? <span id={`partner-first-name-error-${profileId}`} role="alert" className="font-normal text-danger-strong">{fieldError("firstName")}</span> : null}
          </label>
          <label htmlFor={`partner-last-name-${profileId}`} className="grid gap-1.5 text-sm font-medium text-text-primary">Last Name
            <Input id={`partner-last-name-${profileId}`} value={values.lastName} maxLength={80} aria-invalid={Boolean(fieldError("lastName"))} aria-describedby={fieldError("lastName") ? `partner-last-name-error-${profileId}` : undefined} onChange={(event) => setField("lastName", event.target.value)} onBlur={() => setTouched((current) => ({ ...current, lastName: true }))} />
            {fieldError("lastName") ? <span id={`partner-last-name-error-${profileId}`} role="alert" className="font-normal text-danger-strong">{fieldError("lastName")}</span> : null}
          </label>
          <label htmlFor={`partner-phone-${profileId}`} className="grid gap-1.5 text-sm font-medium text-text-primary">Phone
            <Input id={`partner-phone-${profileId}`} value={values.phone} inputMode="tel" aria-invalid={Boolean(fieldError("phone"))} aria-describedby={fieldError("phone") ? `partner-phone-error-${profileId}` : undefined} onChange={(event) => setField("phone", formatPhoneInput(event.target.value))} onBlur={() => setTouched((current) => ({ ...current, phone: true }))} />
            {fieldError("phone") ? <span id={`partner-phone-error-${profileId}`} role="alert" className="font-normal text-danger-strong">{fieldError("phone")}</span> : null}
          </label>
          <label htmlFor={`partner-email-${profileId}`} className="grid gap-1.5 text-sm font-medium text-text-primary">Email
            <Input id={`partner-email-${profileId}`} value={email ?? ""} readOnly aria-readonly="true" className="cursor-not-allowed bg-surface-muted text-text-muted" />
          </label>
          <div className="grid gap-1.5 text-sm font-medium text-text-primary">
            <label htmlFor={`partner-gender-${profileId}`}>Gender</label>
            <Select value={values.gender} onValueChange={(gender) => setField("gender", gender as PartnerDetailsFields["gender"])}>
              <SelectTrigger id={`partner-gender-${profileId}`} aria-label={`Gender for ${firstName} ${lastName}`} aria-invalid={Boolean(fieldError("gender"))} aria-describedby={fieldError("gender") ? `partner-gender-error-${profileId}` : undefined} onBlur={() => setTouched((current) => ({ ...current, gender: true }))}>
                <SelectValue placeholder="Not specified" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
            {fieldError("gender") ? <span id={`partner-gender-error-${profileId}`} role="alert" className="font-normal text-danger-strong">{fieldError("gender")}</span> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-10 rounded-md px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted">Cancel</button>
            <button type="submit" disabled={pending || !valid || !changed} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-brand-primary px-4 text-sm font-semibold text-white hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
              <Save className="size-4" aria-hidden="true" />{pending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  </>;
}
