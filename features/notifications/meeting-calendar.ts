type MeetingCalendarDetails = { id: string; title: string; startsAt: string; endsAt: string; appUrl: string };

function utcCalendarDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldLine(line: string) {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let chunk = "";
  for (const character of line) {
    if (encoder.encode(chunk + character).length > 75) {
      chunks.push(chunk);
      chunk = ` ${character}`;
    } else chunk += character;
  }
  chunks.push(chunk);
  return chunks.join("\r\n");
}

export function googleCalendarUrl(meeting: MeetingCalendarDetails) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: meeting.title,
    dates: `${utcCalendarDate(meeting.startsAt)}/${utcCalendarDate(meeting.endsAt)}`,
    details: `View your Couple Workspace: ${meeting.appUrl}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function meetingIcsContent(meeting: MeetingCalendarDetails) {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Resonate Marriage Ministry//Meeting//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT", `UID:${meeting.id}@resonatemovement.org`, `DTSTAMP:${utcCalendarDate(new Date().toISOString())}`,
    `DTSTART:${utcCalendarDate(meeting.startsAt)}`, `DTEND:${utcCalendarDate(meeting.endsAt)}`,
    `SEQUENCE:${Math.floor(Date.now() / 1000)}`,
    `SUMMARY:${escapeCalendarText(meeting.title)}`, `DESCRIPTION:${escapeCalendarText(`View your Couple Workspace: ${meeting.appUrl}`)}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(foldLine).join("\r\n");
}
