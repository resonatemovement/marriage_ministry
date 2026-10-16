"use client";

import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { saveReminderSettings } from "./reminder-settings-actions";
import { REMINDER_HOURS_MAX, REMINDER_HOURS_MIN, type ReminderSettings as ReminderSettingsValue, type ReminderSettingsErrors } from "./reminder-settings-model";

type FormValue = Pick<ReminderSettingsValue, "meetingEnabled" | "homeworkEnabled"> & { meetingHoursBefore: string; homeworkHoursBefore: string };

function formValue(settings: ReminderSettingsValue): FormValue {
  return { meetingEnabled: settings.meetingEnabled, meetingHoursBefore: String(settings.meetingHoursBefore), homeworkEnabled: settings.homeworkEnabled, homeworkHoursBefore: String(settings.homeworkHoursBefore) };
}

function ReminderControl({ title, description, enabled, onEnabledChange, hours, onHoursChange, error, timingLabel }: {
  title: string; description: string; enabled: boolean; onEnabledChange: (value: boolean) => void; hours: string; onHoursChange: (value: string) => void; error?: string; timingLabel: string;
}) {
  const fieldId = `${title.toLowerCase().replaceAll(" ", "-")}-hours`;
  return <section className="rounded-lg border border-border bg-surface p-5 sm:p-6"><div className="flex items-start justify-between gap-5"><div><h3 className="font-heading text-lg font-bold text-text-primary">{title}</h3><p className="mt-1 text-sm leading-6 text-text-muted">{description}</p></div><div className="flex shrink-0 items-center gap-2"><span className="text-sm font-medium text-text-primary">{enabled ? "Enabled" : "Disabled"}</span><Switch checked={enabled} onCheckedChange={onEnabledChange} aria-label={`${title} ${enabled ? "enabled" : "disabled"}`} /></div></div><label htmlFor={fieldId} className="mt-5 block text-sm font-medium text-text-primary">{timingLabel}</label><Input id={fieldId} name={title.startsWith("Meeting") ? "meetingHoursBefore" : "homeworkHoursBefore"} value={hours} onChange={(event) => onHoursChange(event.target.value)} inputMode="numeric" pattern="[0-9]*" aria-invalid={Boolean(error)} aria-describedby={error ? `${fieldId}-error` : `${fieldId}-help`} className="mt-2 max-w-40" /><p id={`${fieldId}-help`} className="mt-1.5 text-xs text-text-muted">{REMINDER_HOURS_MIN}–{REMINDER_HOURS_MAX} hours</p>{error ? <p id={`${fieldId}-error`} role="alert" className="mt-1.5 text-sm text-danger-strong">{error}</p> : null}</section>;
}

export function ReminderSettings({ initialSettings }: { initialSettings: ReminderSettingsValue }) {
  const [saved, setSaved] = useState(() => formValue(initialSettings));
  const [value, setValue] = useState(() => formValue(initialSettings));
  const [errors, setErrors] = useState<ReminderSettingsErrors>({});
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const formData = new FormData(event.currentTarget);
    formData.set("meetingEnabled", String(value.meetingEnabled));
    formData.set("homeworkEnabled", String(value.homeworkEnabled));
    startTransition(async () => {
      try {
        const result = await saveReminderSettings(formData);
        if ("error" in result) {
          if (result.fieldErrors) setErrors(result.fieldErrors);
          else showErrorToast("Unable to save reminder settings. Please try again.");
          return;
        }
        const next = formValue(result.settings);
        setSaved(next);
        setValue(next);
        showSuccessToast("Reminder settings saved successfully.");
      } catch {
        showErrorToast("Unable to save reminder settings. Please try again.");
      }
    });
  }

  return <section className="mt-10"><div><p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Notifications</p><h2 className="font-heading mt-1 text-2xl font-bold text-text-primary">Reminders</h2><p className="mt-2 text-sm text-text-muted">Configure the automated reminders used across Resonate.</p></div><form onSubmit={submit} noValidate className="mt-5 grid gap-5"><input type="hidden" name="meetingEnabled" value={String(value.meetingEnabled)} /><input type="hidden" name="homeworkEnabled" value={String(value.homeworkEnabled)} /><ReminderControl title="Meeting Reminders" description="Automatically remind Couples about upcoming counseling meetings." enabled={value.meetingEnabled} onEnabledChange={(meetingEnabled) => setValue((current) => ({ ...current, meetingEnabled }))} hours={value.meetingHoursBefore} onHoursChange={(meetingHoursBefore) => setValue((current) => ({ ...current, meetingHoursBefore }))} error={errors.meetingHoursBefore} timingLabel="Hours before meeting" /><ReminderControl title="Homework Reminders" description="Automatically remind Couples about incomplete Homework." enabled={value.homeworkEnabled} onEnabledChange={(homeworkEnabled) => setValue((current) => ({ ...current, homeworkEnabled }))} hours={value.homeworkHoursBefore} onHoursChange={(homeworkHoursBefore) => setValue((current) => ({ ...current, homeworkHoursBefore }))} error={errors.homeworkHoursBefore} timingLabel="Reminder timing (hours)" /><section className="rounded-lg bg-surface-muted p-5"><h3 className="font-heading text-base font-bold text-text-primary">General Information</h3><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-text-muted">Delivery</dt><dd className="mt-0.5 font-medium text-text-primary">Email</dd></div><div><dt className="text-text-muted">Processing</dt><dd className="mt-0.5 font-medium text-text-primary">Checked hourly</dd></div><div><dt className="text-text-muted">Scope</dt><dd className="mt-0.5 font-medium text-text-primary">All campuses</dd></div></dl></section><div><button type="submit" disabled={!dirty || pending} className="min-h-10 rounded-md bg-brand-primary px-5 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving..." : "Save Changes"}</button></div></form></section>;
}
