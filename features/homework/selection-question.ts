import type { Json } from "@/types/database.generated";

export type HomeworkAnswerChoice = { id: string; label: string };
export type HomeworkResponseValue = string | string[];

export function homeworkAnswerChoicesFromJson(value: Json | null): HomeworkAnswerChoice[] {
  if (!Array.isArray(value)) return [];
  return value.filter((choice): choice is { id: string; label: string } =>
    Boolean(choice && typeof choice === "object" && !Array.isArray(choice)
      && "id" in choice && typeof choice.id === "string"
      && "label" in choice && typeof choice.label === "string"),
  ).map(({ id, label }) => ({ id, label }));
}
