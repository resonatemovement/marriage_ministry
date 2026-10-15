import type { Database } from "@/types/database.generated";

export type HomeworkProgressStatus = Database["public"]["Enums"]["homework_progress_status"];

const homeworkProgressLabels: Record<HomeworkProgressStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  submitted: "Submitted",
  reviewed: "Reviewed",
};

export function homeworkProgressLabel(status: HomeworkProgressStatus) {
  return homeworkProgressLabels[status];
}

export function homeworkProgressBadgeClass(status: HomeworkProgressStatus) {
  switch (status) {
    case "not_started":
      return "bg-surface-muted text-text-muted";
    case "in_progress":
      return "bg-info-soft text-info-strong";
    case "submitted":
    case "reviewed":
      return "bg-success-soft text-success-strong";
  }
}

export function participantHomeworkTitle(sessionTitle: string) {
  return `${sessionTitle} Homework`;
}
