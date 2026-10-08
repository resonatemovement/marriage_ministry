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
