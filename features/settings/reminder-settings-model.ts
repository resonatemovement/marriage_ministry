export const REMINDER_HOURS_MIN = 1;
export const REMINDER_HOURS_MAX = 720;

export interface ReminderSettings {
  meetingEnabled: boolean;
  meetingHoursBefore: number;
  homeworkEnabled: boolean;
  homeworkHoursBefore: number;
  updatedAt: string;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  meetingEnabled: true,
  meetingHoursBefore: 24,
  homeworkEnabled: true,
  homeworkHoursBefore: 72,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export type ReminderSettingsInput = Omit<ReminderSettings, "updatedAt">;
export type ReminderSettingsErrors = Partial<Record<"meetingHoursBefore" | "homeworkHoursBefore", string>>;

function parseHours(value: FormDataEntryValue | null, label: string) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!/^\d+$/.test(raw)) return { error: `${label} must be a whole number.` };
  const parsed = Number(raw);
  if (parsed < REMINDER_HOURS_MIN || parsed > REMINDER_HOURS_MAX) {
    return { error: `${label} must be between ${REMINDER_HOURS_MIN} and ${REMINDER_HOURS_MAX} hours.` };
  }
  return { value: parsed };
}

export function parseReminderSettings(formData: FormData): { data: ReminderSettingsInput; errors: null } | { data: null; errors: ReminderSettingsErrors } {
  const meeting = parseHours(formData.get("meetingHoursBefore"), "Meeting reminder timing");
  const homework = parseHours(formData.get("homeworkHoursBefore"), "Homework reminder timing");
  const errors: ReminderSettingsErrors = {};
  if (meeting.error) errors.meetingHoursBefore = meeting.error;
  if (homework.error) errors.homeworkHoursBefore = homework.error;
  if (Object.keys(errors).length) return { data: null, errors };
  return {
    data: {
      meetingEnabled: formData.get("meetingEnabled") === "true",
      meetingHoursBefore: meeting.value!,
      homeworkEnabled: formData.get("homeworkEnabled") === "true",
      homeworkHoursBefore: homework.value!,
    },
    errors: null,
  };
}
