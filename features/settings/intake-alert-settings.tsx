"use client";

import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

import { saveIntakeAlertSettings } from "./intake-alert-settings-actions";
import { INTAKE_ALERT_HOURS_MAX, INTAKE_ALERT_HOURS_MIN, type IntakeAlertSettings, type IntakeAlertSettingsErrors } from "./intake-alert-settings-model";

const fields = [
  ["readyForReviewHours", "Ready for Review", "New requests are actionable immediately; mark as stalled after this threshold."],
  ["underReviewHours", "Under Review", "Flag requests that remain under review beyond this threshold."],
  ["readyToInviteHours", "Ready to Invite", "Flag legacy Ready to Invite requests beyond this threshold."],
  ["invitedOnboardingHours", "Invited — incomplete onboarding", "Flag only while one or both partners have not completed onboarding."],
] as const;

export function IntakeAlertSettingsForm({ initialSettings }: { initialSettings: IntakeAlertSettings }) {
  const [saved, setSaved] = useState(initialSettings);
  const [value, setValue] = useState<Record<keyof IntakeAlertSettings, string>>({
    readyForReviewHours: String(initialSettings.readyForReviewHours),
    underReviewHours: String(initialSettings.underReviewHours),
    readyToInviteHours: String(initialSettings.readyToInviteHours),
    invitedOnboardingHours: String(initialSettings.invitedOnboardingHours),
  });
  const [errors, setErrors] = useState<IntakeAlertSettingsErrors>({});
  const [pending, startTransition] = useTransition();
  const clientError = (input: string) => {
    if (!/^\d+$/.test(input)) return "Enter a positive whole number of hours.";
    const parsed = Number(input);
    return parsed < INTAKE_ALERT_HOURS_MIN || parsed > INTAKE_ALERT_HOURS_MAX
      ? `Enter a value from ${INTAKE_ALERT_HOURS_MIN} to ${INTAKE_ALERT_HOURS_MAX} hours.`
      : undefined;
  };
  const valid = fields.every(([key]) => !clientError(value[key]));
  const dirty = fields.some(([key]) => Number(value[key]) !== saved[key]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    const formData = new FormData();
    fields.forEach(([key]) => formData.set(key, value[key]));
    startTransition(async () => {
      try {
        const result = await saveIntakeAlertSettings(formData);
        if ("error" in result) {
          if (result.fieldErrors) setErrors(result.fieldErrors);
          else showErrorToast("Unable to save Intake Request alert settings. Please try again.");
          return;
        }
        setSaved(result.settings);
        setValue({
          readyForReviewHours: String(result.settings.readyForReviewHours),
          underReviewHours: String(result.settings.underReviewHours),
          readyToInviteHours: String(result.settings.readyToInviteHours),
          invitedOnboardingHours: String(result.settings.invitedOnboardingHours),
        });
        showSuccessToast("Intake Request alert settings saved successfully.");
      } catch {
        showErrorToast("Unable to save Intake Request alert settings. Please try again.");
      }
    });
  }

  return <section className="mt-7 rounded-lg border border-border bg-surface p-5 sm:p-6">
    <div>
      <p className="font-heading text-xs font-extrabold uppercase tracking-widest text-brand-secondary">Intake Requests</p>
      <h2 className="font-heading mt-1 text-2xl font-bold text-text-primary">Intake Request Alerts</h2>
      <p className="mt-2 text-sm text-text-muted">Set elapsed-time thresholds for Intake Request follow-up. Values are whole hours, up to 720 hours (30 days).</p>
    </div>
    <form onSubmit={submit} noValidate className="mt-5 grid gap-4 sm:grid-cols-2">
      {fields.map(([key, label, description]) => {
        const id = `intake-alert-${key}`;
        const error = errors[key] ?? (value[key] !== String(saved[key]) ? clientError(value[key]) : undefined);
        return <div key={key} className="rounded-lg border border-border/70 p-4">
          <label htmlFor={id} className="text-sm font-semibold text-text-primary">{label}</label>
          <p className="mt-1 min-h-10 text-sm text-text-muted">{description}</p>
          <div className="mt-3 flex items-center gap-2">
            <Input id={id} name={key} type="number" inputMode="numeric" min={INTAKE_ALERT_HOURS_MIN} max={INTAKE_ALERT_HOURS_MAX} step={1} value={value[key]} aria-invalid={Boolean(error)} aria-describedby={`${id}-units${error ? ` ${id}-error` : ""}`} onChange={(event) => {
              const next = event.target.value;
              setValue((current) => ({ ...current, [key]: next }));
              setErrors((current) => { const remaining = { ...current }; delete remaining[key]; return remaining; });
            }} />
            <span id={`${id}-units`} className="text-sm text-text-muted">hours</span>
          </div>
          {error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-danger-strong">{error}</p> : null}
        </div>;
      })}
      <div className="sm:col-span-2">
        <button type="submit" disabled={!dirty || !valid || pending} className="min-h-10 rounded-md bg-brand-primary px-5 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Saving..." : "Save Changes"}</button>
      </div>
    </form>
  </section>;
}
