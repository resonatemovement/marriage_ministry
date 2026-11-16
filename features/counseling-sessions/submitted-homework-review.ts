import type { Json } from "@/types/database.generated";
import { homeworkAnswerChoicesFromJson, type HomeworkAnswerChoice } from "@/features/homework/selection-question";
import { groupSideBySideRows } from "@/features/homework/side-by-side-response";

export type SubmittedHomeworkQuestion = {
  blockId: string;
  type: "long_answer" | "checkbox_question" | "radio_question";
  position: number;
  title: string | null;
  content: Json | null;
  choices: Json | null;
  isRequired: boolean;
  description?: string | null;
  answerText: string | null;
  answerValue: Json | null;
};

export type SubmittedHomeworkReview = {
  progressId: string;
  caseId: string;
  profileId: string;
  submittedAt: string;
  sessionTitle: string;
  sessionSequence: number;
  questions: SubmittedHomeworkQuestion[];
};

export function homeworkReviewChoices(value: Json | null): HomeworkAnswerChoice[] {
  return homeworkAnswerChoicesFromJson(value);
}

export function homeworkReviewAnswer(question: SubmittedHomeworkQuestion): string[] {
  if (question.type === "long_answer") {
    return question.answerText?.trim() ? [question.answerText] : [];
  }

  const choices = homeworkReviewChoices(question.choices);
  const selectedIds = question.type === "checkbox_question"
    ? Array.isArray(question.answerValue) ? question.answerValue.filter((value): value is string => typeof value === "string") : []
    : typeof question.answerValue === "string" ? [question.answerValue] : [];

  return selectedIds.flatMap((id) => {
    const choice = choices.find((item) => item.id === id);
    return choice ? [choice.label] : [];
  });
}

export function groupSubmittedHomeworkQuestions(questions: SubmittedHomeworkQuestion[]) {
  return groupSideBySideRows(questions.map((question) => ({ ...question, id: question.blockId }))).map((group) => group.kind === "pair"
    ? { kind: "side_by_side" as const, config: group.config, left: group.left, right: group.right }
    : { kind: "question" as const, question: group.row });
}
