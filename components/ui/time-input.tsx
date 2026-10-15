"use client";

import { useId, useRef, type ChangeEvent } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatDigitsWhileTyping(value: string) {
  if (/^\d{3}$/.test(value)) return `${value.slice(0, 1)}:${value.slice(1)}`;
  if (/^\d{4}$/.test(value)) return `${value.slice(0, 2)}:${value.slice(2)}`;
  return value;
}

export function TimeInput({ value, period, onChange, onPeriodChange, error, label = "Meeting time (required)", name = "time" }: {
  value: string;
  period: "AM" | "PM" | "";
  onChange: (value: string) => void;
  onPeriodChange: (period: "AM" | "PM") => void;
  error?: string | null;
  label?: string;
  name?: string;
}) {
  const inputId = useId();
  const periodId = useId();
  const errorId = useId();
  const lastFormattedInput = useRef<{ formatted: string; digits: string } | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const value = input.value;
    const inputType = (event.nativeEvent as InputEvent).inputType;
    const previous = lastFormattedInput.current;
    const isDeleting = inputType?.startsWith("delete")
      || (!inputType && previous !== null && value.length < previous.formatted.length);
    const isAtEnd = input.selectionStart === value.length;

    if (isDeleting || !isAtEnd) {
      lastFormattedInput.current = null;
      onChange(value);
      return;
    }

    const isContinuingFormattedDigits = previous
      && value.length === previous.formatted.length + 1
      && value.startsWith(previous.formatted);
    const digits = isContinuingFormattedDigits
      ? `${previous.digits}${value.slice(previous.formatted.length)}`
      : value;
    const formatted = formatDigitsWhileTyping(digits);

    lastFormattedInput.current = formatted === digits ? null : { formatted, digits };
    onChange(formatted);
  };

  return <div className="grid gap-1.5 text-sm font-medium">
    <label htmlFor={inputId}>{label}</label>
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
      <Input
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="hh:mm"
        value={value}
        aria-required="true"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={handleChange}
        className={`min-h-11 ${error ? "border-danger-strong" : ""}`}
      />
      <Select value={period || undefined} onValueChange={(value) => { if (value === "AM" || value === "PM") onPeriodChange(value); }}>
        <SelectTrigger id={periodId} aria-label="AM or PM" aria-required="true" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} className="min-h-11">
          <SelectValue placeholder="AM/PM" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="AM">AM</SelectItem>
          <SelectItem value="PM">PM</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {error ? <p id={errorId} role="alert" className="text-sm text-danger-strong">{error}</p> : null}
  </div>;
}
