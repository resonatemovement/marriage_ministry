"use client";
/* eslint-disable react/jsx-key */

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";

import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhoneInput } from "@/features/onboarding/phone";

import { submitPublicIntakeRequest } from "./submission-actions";
import { canSubmitIntake, validateIntakeSubmission } from "./submission";
import {
  canAdvanceIntakeStep,
  capitalizeInitials,
  connections,
  emptyDraft,
  getVisibleStepErrors,
  getVisibleSubmissionErrors,
  type IntakeDraft,
  type PersonDraft,
} from "./validation";

const steps = [
  "About You Both",
  "Your Relationship",
  "Connection to Resonate",
  "Counseling Needs",
  "Review & Submit",
];
const connectionLabels = [
  "Resonate Member",
  "Regular Resonate Church Attendee (3+ times a month)",
  "Attend Resonate MC (Missional Community Small Group)",
  "I attend church occasionally",
  "I do not attend Resonate Church",
];
const partnerConnectionLabels = [
  "Resonate Member",
  "Regular Resonate Church Attendee (3+ times a month)",
  "Attend Resonate MC (Missional Community Small Group)",
  "My partner attends church occasionally",
  "My partner does not attend Resonate Church",
];

type Campus = { id: string; name: string };
type Errors = Record<string, string>;

function Field({
  label,
  value,
  onChange,
  error,
  onBlur,
  type = "text",
  optional = false,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  onBlur?: () => void;
  type?: string;
  optional?: boolean;
  autoCapitalize?: "words";
}) {
  const errorId = useId();
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      <span>
        {label}
        {optional ? (
          <span className="font-normal text-text-muted"> (optional)</span>
        ) : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          onBlur?.();
          if (autoCapitalize) onChange(capitalizeInitials(value));
        }}
        autoCapitalize={autoCapitalize}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`min-h-11 w-full max-w-full min-w-0 box-border rounded-md border bg-white px-3 outline-none focus-visible:border-brand-primary focus-visible:ring-2 focus-visible:ring-brand-primary/20 ${error ? "border-danger" : "border-border"}`}
      />
      <span id={errorId} className="min-h-5 text-sm font-normal text-danger-strong">
        {error ?? " "}
      </span>
    </label>
  );
}

function PersonFields({
  title,
  prefix,
  person,
  setPerson,
  markTouched,
  errors,
}: {
  title: string;
  prefix: string;
  person: PersonDraft;
  setPerson: (person: PersonDraft) => void;
  markTouched: (field: string) => void;
  errors: Errors;
}) {
  const update = (key: keyof PersonDraft, value: string) =>
    setPerson({
      ...person,
      [key]: key === "phone" ? formatPhoneInput(value) : value,
    });
  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Field
          label="First Name"
          autoCapitalize="words"
          value={person.firstName}
          onChange={(value) => update("firstName", value)}
          onBlur={() => markTouched(`${prefix}.firstName`)}
          error={errors[`${prefix}.firstName`]}
        />
        <Field
          label="Last Name"
          autoCapitalize="words"
          value={person.lastName}
          onChange={(value) => update("lastName", value)}
          onBlur={() => markTouched(`${prefix}.lastName`)}
          error={errors[`${prefix}.lastName`]}
        />
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          <span>Gender</span>
          <Select
            value={person.gender}
            onValueChange={(gender) => update("gender", gender)}
          >
            <SelectTrigger
              aria-invalid={Boolean(errors[`${prefix}.gender`])}
              aria-describedby={
                errors[`${prefix}.gender`]
                  ? `${prefix}-gender-error`
                  : undefined
              }
              onBlur={() => markTouched(`${prefix}.gender`)}
            >
              <SelectValue placeholder="Choose gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
            </SelectContent>
          </Select>
          <span
            id={`${prefix}-gender-error`}
            className="min-h-5 text-sm font-normal text-danger-strong"
          >
            {errors[`${prefix}.gender`] ?? " "}
          </span>
        </label>
        <Field
          label="Phone Number"
          value={person.phone}
          onChange={(value) => update("phone", value)}
          onBlur={() => markTouched(`${prefix}.phone`)}
          error={errors[`${prefix}.phone`]}
        />
        <Field
          label="Email Address"
          type="email"
          value={person.email}
          onChange={(value) => update("email", value)}
          onBlur={() => markTouched(`${prefix}.email`)}
          error={errors[`${prefix}.email`]}
        />
        <Field
          label="City"
          optional
          autoCapitalize="words"
          value={person.city}
          onChange={(value) => update("city", value)}
          onBlur={() => markTouched(`${prefix}.city`)}
          error={errors[`${prefix}.city`]}
        />
      </div>
    </section>
  );
}

function Choices({
  title,
  options,
  values,
  multiple,
  onChange,
  onBlur,
  error,
}: {
  title: string;
  options: readonly [string, string][];
  values: string[];
  multiple?: boolean;
  onChange: (values: string[]) => void;
  onBlur: () => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset className="min-w-0 w-full">
      <legend className="block w-full text-base font-bold">{title}</legend>
      <div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
        {options.map(([value, label]) => (
          <label
            key={value}
            className="flex min-w-0 min-h-10 items-start gap-3 text-sm leading-6"
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={title}
              checked={values.includes(value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              onBlur={onBlur}
              onChange={(event) =>
                onChange(
                  multiple
                    ? event.target.checked
                      ? [...values, value]
                      : values.filter((item) => item !== value)
                    : [value],
                )
              }
              className="mt-1 size-4 shrink-0 accent-brand-primary"
            />
            {label}
          </label>
        ))}
        {error ? (
          <p id={errorId} role="alert" className="text-sm font-normal text-danger-strong">{error}</p>
        ) : null}
      </div>
    </fieldset>
  );
}

function Confirmation() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-xl pt-16 text-center">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand-secondary">
          Request Received
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">
          Thank you for reaching out.
        </h1>
        <p className="mt-5 text-base leading-7 text-text-muted">
          Your counseling request has been submitted to the Resonate Marriage
          Ministry team. Our team will review the information you provided and
          contact you about the appropriate next step.
        </p>
        <div className="mt-9 flex justify-center">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand-primary px-5 text-sm font-bold text-white"
          >
            Return to Marriage Ministry
          </Link>
        </div>
      </div>
    </main>
  );
}

export function PublicIntakeForm({ campuses }: { campuses: Campus[] }) {
  const [step, setStep] = useState(1);
  const [draft, setDraftState] = useState<IntakeDraft>(emptyDraft);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submitting = useRef(false);
  const activeCampusIds = campuses.map((campus) => campus.id);
  const errors = getVisibleStepErrors(step, draft, touchedFields, activeCampusIds);
  const finalErrors = getVisibleSubmissionErrors(draft, touchedFields, activeCampusIds);
  const canContinue = canAdvanceIntakeStep(step, draft, activeCampusIds);
  const canSubmit = canSubmitIntake(draft, activeCampusIds);
  const setDraft = (next: IntakeDraft) => {
    setDraftState(next);
    setSubmissionError(null);
  };
  const markTouched = (field: string) => {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  };
  const advance = () => {
    if (canContinue) setStep(Math.min(5, step + 1));
  };
  const edit = (target: number) => {
    setSubmissionError(null);
    setStep(target);
  };
  const person = (value: PersonDraft) => (
    <p className="text-sm leading-6">
      {value.firstName} {value.lastName}
      <br />
      {value.email}
      <br />
      {value.phone}
      <br />
      {value.city}
    </p>
  );
  const review = [
    ["You", person(draft.you), 1],
    ["Your Partner", person(draft.partner), 1],
    [
      "Relationship",
      <p className="text-sm">
        {draft.relationshipStatus || "—"}
        {draft.weddingDate ? ` · ${draft.weddingDate}` : ""}
      </p>,
      2,
    ],
    [
      "Connection to Resonate",
      <p className="text-sm">
        You: {draft.you.connections.join(", ") || "—"}
        <br />
        Partner: {draft.partner.connections.join(", ") || "—"}
      </p>,
      3,
    ],
    [
      "Campus",
      <p className="text-sm">
        {draft.campusOther ||
          campuses.find((campus) => campus.id === draft.campusId)?.name ||
          "—"}
      </p>,
      3,
    ],
    [
      "Counseling Needs",
      <p className="text-sm">
        Working with counselor: {draft.workingWithCounselor || "—"}
        <br />
        Support: {draft.requestedSupport.join(", ") || "—"}
      </p>,
      4,
    ],
    [
      "Goals",
      <p className="whitespace-pre-wrap text-sm">{draft.goals || "—"}</p>,
      4,
    ],
    [
      "Questions",
      <p className="whitespace-pre-wrap text-sm">{draft.questions || "—"}</p>,
      4,
    ],
    [
      "How You Found Us",
      <p className="text-sm">
        {draft.referralSource || "—"}
        {draft.referralOther ? ` · ${draft.referralOther}` : ""}
      </p>,
      4,
    ],
  ] as const;
  const submit = () => {
    if (submitting.current) return;
    const validation = validateIntakeSubmission(draft, activeCampusIds);
    if ("errors" in validation) {
      setSubmissionError(
        "Please review the information in your request and try again.",
      );
      return;
    }
    submitting.current = true;
    setSubmissionError(null);
    startTransition(async () => {
      const result = await submitPublicIntakeRequest(draft);
      submitting.current = false;
      if ("error" in result) {
        setSubmissionError(result.error);
        return;
      }
      setSubmitted(true);
    });
  };

  if (submitted) return <Confirmation />;

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-brand-primary hover:underline"
          >
            ← Marriage Ministry
          </Link>
          <span className="text-sm text-text-muted">Step {step} of 5</span>
        </div>
        <header className="mt-8">
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand-secondary">
            Counseling Request
          </p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight">
            {steps[step - 1]}
          </h1>
        </header>
        <nav
          aria-label="Form progress"
          className="mt-8 hidden items-center md:flex"
        >
          {steps.map((label, index) => (
            <div key={label} className="flex min-w-0 flex-1 items-center">
              <div
                className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${index + 1 < step ? "bg-success text-white" : index + 1 === step ? "bg-brand-primary text-white" : "bg-sidebar-accent text-sidebar-muted"}`}
              >
                {index + 1 < step ? "✓" : index + 1}
              </div>
              <span className="ml-2 truncate text-xs">{label}</span>
              {index < 4 ? (
                <div className="mx-3 h-px flex-1 bg-border" />
              ) : null}
            </div>
          ))}
        </nav>
        <div className="mt-8">
          {step === 1 ? (
            <div className="grid min-w-0 gap-5 xl:grid-cols-2">
              <PersonFields
                title="You"
                prefix="you"
                person={draft.you}
                setPerson={(you) => setDraft({ ...draft, you })}
                markTouched={markTouched}
                errors={errors}
              />
              <PersonFields
                title="Your Partner"
                prefix="partner"
                person={draft.partner}
                setPerson={(partner) => setDraft({ ...draft, partner })}
                markTouched={markTouched}
                errors={errors}
              />
            </div>
          ) : null}
          {step === 2 ? (
            <section className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-6 rounded-lg border border-border bg-surface p-6">
              <Choices
                title="What best describes your relationship status?"
                options={[
                  ["pre_engaged", "Pre-engaged"],
                  ["engaged", "Engaged"],
                  ["married", "Married"],
                ]}
                values={
                  draft.relationshipStatus ? [draft.relationshipStatus] : []
                }
                onChange={([relationshipStatus]) =>
                  setDraft({ ...draft, relationshipStatus })
                }
                onBlur={() => markTouched("relationshipStatus")}
                error={errors.relationshipStatus}
              />
              <DatePicker
                value={draft.weddingDate}
                onChange={(weddingDate) => setDraft({ ...draft, weddingDate })}
                error={errors.weddingDate}
                onBlur={() => markTouched("weddingDate")}
              />
            </section>
          ) : null}
          {step === 3 ? (
            <section className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-8 rounded-lg border border-border bg-surface p-6">
              <Choices
                title="Your connection to Resonate"
                multiple
                options={connectionLabels.map(
                  (label, index) =>
                    [connections[index]!, label] as [string, string],
                )}
                values={draft.you.connections}
                onBlur={() => markTouched("you.connections")}
                onChange={(values) =>
                  setDraft({
                    ...draft,
                    you: { ...draft.you, connections: values },
                  })
                }
                error={errors["you.connections"]}
              />
              <Choices
                title="Your partner's connection to Resonate"
                multiple
                options={partnerConnectionLabels.map(
                  (label, index) =>
                    [connections[index]!, label] as [string, string],
                )}
                values={draft.partner.connections}
                onBlur={() => markTouched("partner.connections")}
                onChange={(values) =>
                  setDraft({
                    ...draft,
                    partner: { ...draft.partner, connections: values },
                  })
                }
                error={errors["partner.connections"]}
              />
              <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-2">
                <label className="min-w-0 text-base font-bold">
                  What campus do you and your partner primarily attend?
                </label>
                <Select
                  value={draft.campusId || (draft.campusOther ? "other" : "")}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      campusId: value === "other" ? "" : value,
                      campusOther: value === "other" ? draft.campusOther : "",
                    })
                  }
                >
                  <SelectTrigger aria-invalid={Boolean(errors.campus)} aria-describedby={errors.campus ? "campus-error" : undefined} onBlur={() => markTouched("campus")}>
                    <SelectValue placeholder="Choose an active campus" />
                  </SelectTrigger>
                  <SelectContent>
                    {campuses.map((campus) => (
                      <SelectItem key={campus.id} value={campus.id}>
                        {campus.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {errors.campus ? <p id="campus-error" role="alert" className="text-sm text-danger-strong">{errors.campus}</p> : null}
                {draft.campusOther || !draft.campusId ? (
                  <Field
                    label="Other campus"
                    value={draft.campusOther}
                    onBlur={() => markTouched("campus")}
                    onChange={(campusOther) =>
                      setDraft({ ...draft, campusOther })
                    }
                  />
                ) : null}
              </div>
            </section>
          ) : null}
          {step === 4 ? (
            <section className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-7 rounded-lg border border-border bg-surface p-6">
              <Choices
                title="Are you or your partner currently working with a Counselor/Therapist?"
                options={[
                  ["yes", "Yes"],
                  ["no", "No"],
                ]}
                values={
                  draft.workingWithCounselor ? [draft.workingWithCounselor] : []
                }
                onBlur={() => markTouched("workingWithCounselor")}
                onChange={([workingWithCounselor]) =>
                  setDraft({ ...draft, workingWithCounselor })
                }
                error={errors.workingWithCounselor}
              />
              <Choices
                title="We would like:"
                multiple
                options={[
                  [
                    "lay_counselor",
                    "To work with one of Resonate's Marriage Lay Counselors",
                  ],
                  [
                    "professional_referral",
                    "To be referred to a professional therapist",
                  ],
                ]}
                values={draft.requestedSupport}
                onBlur={() => markTouched("requestedSupport")}
                onChange={(requestedSupport) =>
                  setDraft({ ...draft, requestedSupport })
                }
                error={errors.requestedSupport}
              />
              <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-sm font-medium">
                What goals or outcomes are you hoping to achieve from
                participating in the marriage lay counseling program?
                <span className="font-normal text-text-muted">
                  Please be specific in what you need help with.
                </span>
                <textarea
                  value={draft.goals}
                  onBlur={() => markTouched("goals")}
                  aria-invalid={Boolean(errors.goals)}
                  aria-describedby={errors.goals ? "goals-error" : undefined}
                  onChange={(event) =>
                    setDraft({ ...draft, goals: event.target.value })
                  }
                  className="min-h-36 w-full max-w-full min-w-0 rounded-md border border-border bg-white p-3"
                />
                {errors.goals ? (
                  <span id="goals-error" className="font-normal text-danger-strong">
                    {errors.goals}
                  </span>
                ) : null}
              </label>
              <label className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 text-sm font-medium">
                What questions do you have about the marriage lay counseling
                program?{" "}
                <span className="font-normal text-text-muted">(optional)</span>
                <textarea
                  value={draft.questions}
                  onBlur={() => markTouched("questions")}
                  onChange={(event) =>
                    setDraft({ ...draft, questions: event.target.value })
                  }
                  aria-invalid={Boolean(errors.questions)}
                  aria-describedby={errors.questions ? "questions-error" : undefined}
                  className="min-h-28 w-full max-w-full min-w-0 rounded-md border border-border bg-white p-3"
                />
                {errors.questions ? <span id="questions-error" className="font-normal text-danger-strong">{errors.questions}</span> : null}
              </label>
              <div className="grid min-w-0 w-full grid-cols-[minmax(0,1fr)] gap-2">
                <Choices
                  title="How did you find out about us?"
                  options={[
                    ["church_announcements", "Church announcements"],
                    ["mc", "Through my MC"],
                    ["friend", "Referral from a friend"],
                    ["ministry_leader", "Referral from a ministry leader"],
                    ["website", "Found it on the Website"],
                    ["social_media", "Social Media"],
                    ["other", "Other"],
                  ]}
                  values={draft.referralSource ? [draft.referralSource] : []}
                  onBlur={() => markTouched("referralSource")}
                  onChange={([referralSource]) =>
                    setDraft({
                      ...draft,
                      referralSource,
                      referralOther:
                        referralSource === "other" ? draft.referralOther : "",
                    })
                  }
                  error={errors.referralSource}
                />
                {draft.referralSource === "other" ? (
                  <Field
                    label="How did you find us?"
                    value={draft.referralOther}
                    onBlur={() => markTouched("referralOther")}
                    onChange={(referralOther) =>
                      setDraft({ ...draft, referralOther })
                    }
                    error={errors.referralOther}
                  />
                ) : null}
              </div>
            </section>
          ) : null}
          {step === 5 ? (
            <section className="grid gap-5">
              <p className="rounded-lg bg-info-soft p-4 text-sm leading-6 text-info-strong">
                Please review your information before submitting. Our Marriage
                Ministry team will review the information you provided and
                contact you about the appropriate next step.
              </p>
              {Object.keys(finalErrors).length ? (
                <div role="alert" className="rounded-lg border border-danger bg-surface p-4 text-sm text-danger-strong">
                  <p>Please review these sections before submitting:</p>
                  <ul className="mt-2 list-inside list-disc">
                    {Object.entries(finalErrors).map(([field, message]) => {
                      const target = field.startsWith("you.") || field.startsWith("partner.")
                        ? 1
                        : ["relationshipStatus", "weddingDate"].includes(field)
                          ? 2
                          : ["campus", "you.connections", "partner.connections"].includes(field)
                            ? 3
                            : 4;
                      return <li key={field}>{message} <button type="button" onClick={() => edit(target)} className="font-semibold underline">Edit section</button></li>;
                    })}
                  </ul>
                </div>
              ) : null}
              {review.map(([title, body, target]) => (
                <section
                  key={title}
                  className="rounded-lg border border-border bg-surface p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-bold">{title}</h2>
                      {body}
                    </div>
                    <button
                      type="button"
                      onClick={() => edit(target)}
                      disabled={isPending}
                      className="text-sm font-bold text-brand-primary underline disabled:opacity-50"
                    >
                      Edit
                    </button>
                  </div>
                </section>
              ))}
            </section>
          ) : null}
        </div>
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => {
              edit(Math.max(1, step - 1));
            }}
            disabled={step === 1 || isPending}
            className="min-h-11 rounded-md px-4 text-sm font-bold text-text-muted hover:bg-surface-muted disabled:opacity-40"
          >
            Back
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={advance}
              disabled={!canContinue || isPending}
              className="min-h-11 rounded-md bg-brand-primary px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {step === 4 ? "Review Request" : `Continue to ${steps[step]}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit || isPending}
              className="min-h-11 rounded-md bg-brand-primary px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPending ? "Submitting..." : "Submit Counseling Request"}
            </button>
          )}
        </div>
        {step === 5 && submissionError ? (
          <p
            role="alert"
            className="mt-3 text-right text-sm text-danger-strong"
          >
            {submissionError}
          </p>
        ) : null}
      </div>
    </main>
  );
}
