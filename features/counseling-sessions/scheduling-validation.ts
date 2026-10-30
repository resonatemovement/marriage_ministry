import { counselingDateOnly, counselingDateTimeInstant } from "./meeting-date-time";

const canonicalTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const editableTimePattern = /^(\d{1,2}):([0-5]\d)$/;
const digitTimePattern = /^(\d{1,2})(\d{2})$/;
const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export type MeetingPeriod = "AM" | "PM" | "";

export function normalizeMeetingTime(value: string | null, period: MeetingPeriod | null) {
  if (!value?.trim()) return { time: null, displayTime: value ?? "", error: "Meeting time is required." } as const;
  const trimmedValue = value.trim();
  const match = editableTimePattern.exec(trimmedValue) ?? digitTimePattern.exec(trimmedValue);
  if (!match) return { time: null, displayTime: value, error: "Enter a valid time in hh:mm format." } as const;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const displayTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (hour < 1 || hour > 12) return { time: null, displayTime, error: "Enter a valid time in hh:mm format." } as const;
  if (period !== "AM" && period !== "PM") return { time: null, displayTime, error: "Choose AM or PM." } as const;
  const hour24 = (hour % 12) + (period === "PM" ? 12 : 0);
  return { time: `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, displayTime, error: null } as const;
}

export function formatMeetingTime(value: string | null) {
  if (!value || !canonicalTimePattern.test(value)) return { time: "", period: "" } as const;
  const [hourText, minute] = value.split(":");
  const hour24 = Number(hourText);
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? "PM" : "AM";
  return { time: `${String(hour12).padStart(2, "0")}:${minute}`, period } as const;
}

export function meetingTimeDefaults(kind: "new" | "reschedule", savedTime: string | null = null) {
  return kind === "reschedule" ? formatMeetingTime(savedTime) : { time: "", period: "PM" } as const;
}

function isCalendarDate(value: string) {
  const match = dateOnlyPattern.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year! < 1900 || year! > 2100) return false;
  const parsed = new Date(Date.UTC(year!, month! - 1, day!));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month! - 1 && parsed.getUTCDate() === day;
}

export function validateCanonicalMeetingStart(date: string | null, time: string | null, now = new Date()) {
  if (!date) return { instant: null, dateError: "Meeting date is required.", timeError: null } as const;
  if (!isCalendarDate(date)) return { instant: null, dateError: "Enter a valid calendar date.", timeError: null } as const;
  const today = counselingDateOnly(now);
  if (date < today) return { instant: null, dateError: "Meeting date cannot be in the past.", timeError: null } as const;
  if (!time || !canonicalTimePattern.test(time)) return { instant: null, dateError: null, timeError: "Enter a valid meeting time." } as const;
  const instant = counselingDateTimeInstant(date, time);
  if (!instant) return { instant: null, dateError: null, timeError: "Choose a valid local meeting time." } as const;
  if (instant.getTime() <= now.getTime()) {
    return { instant: null, dateError: null, timeError: "Meeting time must be in the future." } as const;
  }
  return { instant, dateError: null, timeError: null } as const;
}

export function minimumMeetingDate(now: Date, previousMeetingStartsAt: string | null = null) {
  const today = counselingDateOnly(now);
  if (!previousMeetingStartsAt) return today;
  const previousMeetingDate = counselingDateOnly(new Date(previousMeetingStartsAt));
  const [year, month, day] = previousMeetingDate.split("-").map(Number);
  const nextDay = new Date(Date.UTC(year!, month! - 1, day! + 1));
  const earliestAfterPrevious = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;
  return earliestAfterPrevious > today ? earliestAfterPrevious : today;
}

export function validateMeetingSchedule(date: string | null, time: string | null, period: MeetingPeriod | null, now = new Date(), previousMeetingStartsAt: string | null = null) {
  const normalizedTime = normalizeMeetingTime(time, period);
  const start = validateCanonicalMeetingStart(date, normalizedTime.time, now);
  const previousStart = previousMeetingStartsAt ? Date.parse(previousMeetingStartsAt) : NaN;
  const previousDate = Number.isFinite(previousStart) ? counselingDateOnly(new Date(previousStart)) : null;
  const isNotAfterPreviousDate = Boolean(date && previousDate && date <= previousDate);
  return {
    date: date ?? "",
    time: normalizedTime.time,
    displayTime: normalizedTime.displayTime,
    dateError: start.dateError ?? (isNotAfterPreviousDate ? "Meeting date must be after the previous meeting date." : null),
    timeError: normalizedTime.error ?? start.timeError,
  } as const;
}
