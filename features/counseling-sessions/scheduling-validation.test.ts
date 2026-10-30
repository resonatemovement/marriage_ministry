import { describe, expect, it } from "vitest";

import { counselingDateOnly, counselingDateTimeInstant } from "./meeting-date-time";
import { formatMeetingTime, meetingTimeDefaults, minimumMeetingDate, normalizeMeetingTime, validateCanonicalMeetingStart, validateMeetingSchedule } from "./scheduling-validation";

describe("lifecycle meeting-time validation", () => {
  it("normalizes editable hh:mm and AM/PM to canonical HH:mm", () => {
    expect(normalizeMeetingTime("3:00", "PM")).toEqual({ time: "15:00", displayTime: "03:00", error: null });
    expect(normalizeMeetingTime("03:00", "PM").time).toBe("15:00");
    expect(normalizeMeetingTime("9:30", "AM")).toEqual({ time: "09:30", displayTime: "09:30", error: null });
    expect(normalizeMeetingTime("09:30", "AM").time).toBe("09:30");
    expect(normalizeMeetingTime("12:00", "AM").time).toBe("00:00");
    expect(normalizeMeetingTime("12:00", "PM").time).toBe("12:00");
    expect(formatMeetingTime("15:00")).toEqual({ time: "03:00", period: "PM" });
    expect(formatMeetingTime("00:00")).toEqual({ time: "12:00", period: "AM" });
    expect(validateMeetingSchedule("2026-10-15", "3:00", "PM", new Date("2026-10-15T20:00:00.000Z"))).toEqual({ date: "2026-10-15", time: "15:00", displayTime: "03:00", dateError: null, timeError: null });
  });

  it("formats digit-only entry on validation and submits canonical HH:mm", () => {
    expect(normalizeMeetingTime("300", "PM")).toEqual({ time: "15:00", displayTime: "03:00", error: null });
    expect(normalizeMeetingTime("0300", "PM")).toEqual({ time: "15:00", displayTime: "03:00", error: null });
    expect(normalizeMeetingTime("930", "AM")).toEqual({ time: "09:30", displayTime: "09:30", error: null });
    expect(normalizeMeetingTime("0930", "AM")).toEqual({ time: "09:30", displayTime: "09:30", error: null });
    expect(normalizeMeetingTime("1230", "PM")).toEqual({ time: "12:30", displayTime: "12:30", error: null });
    expect(validateMeetingSchedule("2026-10-15", "300", "PM", new Date("2026-10-15T20:00:00.000Z"))).toMatchObject({ time: "15:00", displayTime: "03:00", timeError: null });
  });

  it("defaults new scheduling to PM and preserves the saved period for rescheduling", () => {
    expect(meetingTimeDefaults("new")).toEqual({ time: "", period: "PM" });
    expect(meetingTimeDefaults("reschedule", "15:00")).toEqual({ time: "03:00", period: "PM" });
    expect(meetingTimeDefaults("reschedule", "09:30")).toEqual({ time: "09:30", period: "AM" });
    expect(meetingTimeDefaults("reschedule", "00:00")).toEqual({ time: "12:00", period: "AM" });
    expect(validateMeetingSchedule("2026-10-15", "3:00", meetingTimeDefaults("new").period, new Date("2026-10-15T20:00:00.000Z"))).toMatchObject({ time: "15:00", timeError: null });
  });

  it("returns inline required and invalid time errors", () => {
    expect(normalizeMeetingTime(null, "AM").error).toBe("Meeting time is required.");
    expect(normalizeMeetingTime("", "AM").error).toBe("Meeting time is required.");
    expect(normalizeMeetingTime("25:61", "PM").error).toBe("Enter a valid time in hh:mm format.");
    expect(normalizeMeetingTime("13:00", "PM").error).toBe("Enter a valid time in hh:mm format.");
    expect(normalizeMeetingTime("not-a-time", "AM").error).toBe("Enter a valid time in hh:mm format.");
  });

  it("pads a valid partial time but rejects missing AM/PM until selection", () => {
    expect(normalizeMeetingTime("3:00", "")).toEqual({ time: null, displayTime: "03:00", error: "Choose AM or PM." });
    expect(normalizeMeetingTime("9:30", null).error).toBe("Choose AM or PM.");
    expect(validateMeetingSchedule("2026-10-15", "3:00", "", new Date("2026-10-15T20:00:00.000Z")).timeError).toBe("Choose AM or PM.");
  });

  it("retains the valid date or time when the other field is invalid", () => {
    expect(validateMeetingSchedule(null, "03:00", "PM", new Date("2026-10-15T20:00:00.000Z"))).toEqual({ date: "", time: "15:00", displayTime: "03:00", dateError: "Meeting date is required.", timeError: null });
    expect(validateMeetingSchedule("2026-10-15", null, "AM", new Date("2026-10-15T20:00:00.000Z"))).toEqual({ date: "2026-10-15", time: null, displayTime: "", dateError: null, timeError: "Meeting time is required." });
  });

  it("compares full Los Angeles date and time while accepting future schedule times", () => {
    const now = new Date("2026-10-15T20:00:00.000Z"); // 1:00 PM in Los Angeles
    expect(counselingDateOnly(now)).toBe("2026-10-15");
    expect(validateMeetingSchedule("2026-10-14", "3:00", "PM", now).dateError).toBe("Meeting date cannot be in the past.");
    expect(validateMeetingSchedule("2026-10-15", "10:00", "AM", now).timeError).toBe("Meeting time must be in the future.");
    expect(validateMeetingSchedule("2026-10-15", "3:00", "PM", now)).toMatchObject({ time: "15:00", dateError: null, timeError: null });
    expect(validateMeetingSchedule("2026-10-16", "9:00", "AM", now)).toMatchObject({ time: "09:00", dateError: null, timeError: null });
    expect(validateMeetingSchedule("2026-02-30", "9:00", "AM", now).dateError).toBe("Enter a valid calendar date.");
  });

  it("converts Los Angeles wall time to an instant independently of the host timezone", () => {
    expect(counselingDateTimeInstant("2026-10-15", "15:00")?.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(counselingDateTimeInstant("2026-03-08", "02:30")).toBeNull();
    expect(validateCanonicalMeetingStart("2026-10-15", "10:00", new Date("2026-10-15T20:00:00.000Z")).timeError).toBe("Meeting time must be in the future.");
    expect(validateCanonicalMeetingStart("2026-10-16", "09:00", new Date("2026-10-15T20:00:00.000Z")).instant?.toISOString()).toBe("2026-10-16T16:00:00.000Z");
  });

  it("requires the next Session to be on a calendar date after its predecessor", () => {
    const now = new Date("2026-10-30T16:00:00.000Z");
    const previous = "2026-11-01T18:00:00.000Z"; // 10:00 AM in Los Angeles after the DST change.
    expect(minimumMeetingDate(now, previous)).toBe("2026-11-02");
    for (const time of ["09:00", "10:00", "10:01", "11:00"]) {
      expect(validateMeetingSchedule("2026-11-01", time, "AM", now, previous).dateError).toBe("Meeting date must be after the previous meeting date.");
    }
    expect(validateMeetingSchedule("2026-10-31", "12:00", "PM", now, previous).dateError).toBe("Meeting date must be after the previous meeting date.");
    expect(validateMeetingSchedule("2026-11-02", "09:00", "AM", now, previous)).toMatchObject({ dateError: null, timeError: null });
  });

  it("calculates the following Los Angeles calendar day across DST boundaries without adding 24 hours", () => {
    const now = new Date("2026-10-30T16:00:00.000Z");
    expect(minimumMeetingDate(now, "2026-11-01T18:00:00.000Z")).toBe("2026-11-02");
    const springNow = new Date("2026-03-01T17:00:00.000Z");
    expect(minimumMeetingDate(springNow, "2026-03-07T20:00:00.000Z")).toBe("2026-03-08");
    expect(minimumMeetingDate(springNow, "2026-03-08T19:00:00.000Z")).toBe("2026-03-09");
    expect(validateMeetingSchedule("2026-11-02", "09:00", "AM", now, "2026-11-01T18:00:00.000Z")).toMatchObject({ dateError: null, timeError: null });
    expect(validateMeetingSchedule("2026-03-08", "09:00", "AM", springNow, "2026-03-07T20:00:00.000Z")).toMatchObject({ dateError: null, timeError: null });
  });
});
