import { isValidMaterialUrl } from "@/features/session-builder/model";

// Mirrors the Homework version-block URL constraint, including its hosted URL requirement.
const homeworkVideoUrlPattern = /^https?:\/\/(\[[0-9a-f:.]+\]|[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*\.?)(:[0-9]{1,5})?([/?#][^\s]*)?$/i;

export function isValidHomeworkVideoUrl(value: string) {
  return value === value.trim() && isValidMaterialUrl(value) && homeworkVideoUrlPattern.test(value);
}
