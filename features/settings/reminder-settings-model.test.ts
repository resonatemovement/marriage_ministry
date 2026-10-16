import { describe, expect, it } from "vitest";

import { DEFAULT_REMINDER_SETTINGS, parseReminderSettings } from "./reminder-settings-model";

function form(meeting = "24", homework = "72") {
  const data = new FormData();
  data.set("meetingEnabled", "true");
  data.set("homeworkEnabled", "true");
  data.set("meetingHoursBefore", meeting);
  data.set("homeworkHoursBefore", homework);
  return data;
}

describe("global reminder settings", () => {
  it("preserves the existing enabled 24-hour and 72-hour defaults", () => {
    expect(DEFAULT_REMINDER_SETTINGS).toMatchObject({ meetingEnabled: true, meetingHoursBefore: 24, homeworkEnabled: true, homeworkHoursBefore: 72 });
  });

  it("accepts positive whole hours within the documented range", () => {
    expect(parseReminderSettings(form("1", "720"))).toMatchObject({ data: { meetingHoursBefore: 1, homeworkHoursBefore: 720 }, errors: null });
  });

  it.each([["", "72"], ["0", "72"], ["1.5", "72"], ["letters", "72"], ["24", "721"]])("rejects invalid numeric values while identifying the field", (meeting, homework) => {
    const result = parseReminderSettings(form(meeting, homework));
    expect(result.data).toBeNull();
    expect(result.errors).toBeTruthy();
  });

  it("preserves configured timing when a reminder is disabled", () => {
    const data = form("36", "96");
    data.set("meetingEnabled", "false");
    const result = parseReminderSettings(data);
    expect(result).toMatchObject({ data: { meetingEnabled: false, meetingHoursBefore: 36, homeworkEnabled: true, homeworkHoursBefore: 96 } });
  });
});
