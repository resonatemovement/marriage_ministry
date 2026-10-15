export const COUNSELING_TIME_ZONE = "America/Los_Angeles";

const schedulingPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: COUNSELING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function schedulingDateTimeParts(value: Date) {
  const parts = schedulingPartsFormatter.formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? NaN);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

export function counselingDateOnly(value: Date) {
  const parts = schedulingDateTimeParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function counselingDateTimeInstant(date: string, time: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const [year, month, day, hour, minute] = [...dateMatch.slice(1), ...timeMatch.slice(1)].map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const requested = { year, month, day, hour, minute, second: 0 };
  const matchingInstants = new Set<number>();

  // Sampling offsets on either side handles DST transitions without depending on the host timezone.
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = wallClockAsUtc + hours * 60 * 60 * 1000;
    const local = schedulingDateTimeParts(new Date(probe));
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const candidate = wallClockAsUtc - (localAsUtc - probe);
    const actual = schedulingDateTimeParts(new Date(candidate));
    if (actual.year === requested.year && actual.month === requested.month && actual.day === requested.day && actual.hour === requested.hour && actual.minute === requested.minute && actual.second === requested.second) {
      matchingInstants.add(candidate);
    }
  }

  if (!matchingInstants.size) return null;
  return new Date(Math.min(...matchingInstants));
}

function meetingDateTimeParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: COUNSELING_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    month: get("month"),
    day: get("day"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    dayPeriod: get("dayPeriod"),
  };
}

export function formatMeetingNotificationTime(value: string) {
  const { month, day, hour, minute, dayPeriod } = meetingDateTimeParts(value);
  return `${month} ${day} at ${hour}:${minute} ${dayPeriod}`;
}

export function formatCounselingMeetingDateTime(value: string) {
  const { month, day, year, hour, minute, dayPeriod } = meetingDateTimeParts(value);
  return `${month} ${day}, ${year}, ${hour}:${minute} ${dayPeriod}`;
}
