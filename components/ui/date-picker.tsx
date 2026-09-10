"use client";

import { CalendarDays, X } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: string): Date | undefined {
  const match = dateOnlyPattern.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return undefined;
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

export function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateLabel(value: string) {
  const date = parseDateOnly(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : "Select a date";
}

export function DatePicker({ value, onChange, label = "Wedding Date" }: { value: string; onChange: (value: string) => void; label?: string }) {
  const selected = parseDateOnly(value);
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1.5 text-sm font-medium"><span>{label} <span className="font-normal text-text-muted">(optional)</span></span><Popover><PopoverTrigger asChild><button type="button" className="inline-flex min-h-11 w-full items-center justify-between rounded-md border border-border bg-white px-3 text-left font-normal focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"><span className={selected ? "text-text-primary" : "text-text-muted"}>{formatDateLabel(value)}</span><CalendarDays className="size-4 shrink-0 text-text-muted" aria-hidden="true" /></button></PopoverTrigger><PopoverContent align="start" sideOffset={8} className="w-[min(19rem,calc(100vw-2rem))] p-0"><Calendar mode="single" selected={selected} defaultMonth={selected} onSelect={(date) => { if (date) onChange(formatDateOnly(date)); }} /><div className="flex justify-end border-t border-border p-2">{selected ? <button type="button" onClick={() => onChange("")} className="inline-flex min-h-9 items-center gap-1 rounded-sm px-2 text-xs font-semibold text-text-muted hover:bg-surface-muted hover:text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"><X className="size-3" aria-hidden="true" />Clear date</button> : null}</div></PopoverContent></Popover></div>;
}
