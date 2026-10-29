"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateInputPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function parseDateOnly(value: string): Date | undefined {
  const match = dateOnlyPattern.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return undefined;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateInput(value: string) {
  const date = parseDateOnly(value);
  if (!date) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}/${date.getFullYear()}`;
}

export function parseDateInput(value: string): { date: string; error: string | null } {
  if (!value) return { date: "", error: null };
  const match = dateInputPattern.exec(value);
  if (!match) return { date: "", error: "Enter a date in MM/DD/YYYY format." };
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (year < 1900 || year > 2100 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return { date: "", error: "Enter a valid calendar date." };
  }
  return { date: formatDateOnly(date), error: null };
}

export function DatePicker({ value, onChange, onBlur, label = "Wedding Date", required = false, error: externalError, minDate }: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  required?: boolean;
  error?: string | null;
  minDate?: string;
}) {
  const selected = parseDateOnly(value);
  const minimumDate = minDate ? parseDateOnly(minDate) : undefined;
  const calendarMonth = selected && (!minDate || formatDateOnly(selected) >= minDate) ? selected : minimumDate;
  const inputId = useId();
  const errorId = useId();
  const lastEmittedValue = useRef(value);
  const [inputValue, setInputValue] = useState(() => formatDateInput(value));
  const [inputError, setInputError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (lastEmittedValue.current === value) return;
    lastEmittedValue.current = value;
    setInputValue(formatDateInput(value));
    setInputError(null);
  }, [value]);

  const error = (touched || externalError ? inputError : null) ?? externalError ?? (required && touched && !value ? "Meeting date is required." : null);
  const selectDate = (date?: Date) => {
    if (!date) return;
    const nextValue = formatDateOnly(date);
    lastEmittedValue.current = nextValue;
    setInputValue(formatDateInput(nextValue));
    setInputError(null);
    onChange(nextValue);
  };

  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 text-sm font-medium">
    <label htmlFor={inputId}>{label} <span className="font-normal text-text-muted">({required ? "required" : "optional"})</span></label>
    <div className="flex min-w-0">
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        placeholder="MM/DD/YYYY"
        value={inputValue}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onBlur={() => { setTouched(true); onBlur?.(); }}
        onChange={(event) => {
          const nextText = event.target.value;
          const parsed = parseDateInput(nextText);
          setInputValue(nextText);
          setInputError(parsed.error);
          setTouched(false);
          lastEmittedValue.current = parsed.date;
          onChange(parsed.date);
        }}
        className={`min-h-11 min-w-0 flex-1 rounded-l-md border bg-white px-3 text-text-primary outline-none focus-visible:outline-none focus-visible:border-brand-secondary ${error ? "border-danger-strong" : "border-border"}`}
      />
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label={`Open ${label} calendar`} className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-r-md border border-l-0 border-border bg-white text-text-muted hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:text-text-primary">
            <CalendarDays className="size-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={8} className="w-[min(19rem,calc(100vw-2rem))] p-0">
          <Calendar mode="single" selected={selected} defaultMonth={calendarMonth} disabled={minimumDate ? { before: minimumDate } : undefined} onSelect={selectDate} />
          <div className="flex justify-end border-t border-border p-2">{selected && !required ? <button type="button" onClick={() => { lastEmittedValue.current = ""; setInputValue(""); setInputError(null); onChange(""); }} className="inline-flex min-h-9 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-text-muted hover:bg-surface-muted hover:text-text-primary focus-visible:bg-surface-muted focus-visible:text-text-primary"><X className="size-3" aria-hidden="true" />Clear date</button> : null}</div>
        </PopoverContent>
      </Popover>
    </div>
    {error ? <p id={errorId} role="alert" className="text-sm text-danger-strong">{error}</p> : null}
  </div>;
}
