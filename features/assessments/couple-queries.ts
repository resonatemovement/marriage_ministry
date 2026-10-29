import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assessmentStatus, type CoupleAssessmentQuestion, type CoupleAssessmentResult, type CoupleAssessmentStatus } from "./couple-model";

export type CoupleAssessmentSummary = {
  assignmentId: string;
  title: string;
  sessionTitle: string;
  status: CoupleAssessmentStatus;
};

export type CoupleAssessmentData = CoupleAssessmentSummary & {
  attemptId: string | null;
  questions: CoupleAssessmentQuestion[];
  answers: Record<string, string>;
  results: CoupleAssessmentResult[];
};

export async function getCurrentCoupleAssessmentSummaries(profileId: string): Promise<CoupleAssessmentSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_current_couple_case_team");
  if (error) throw new Error("Assessments are unavailable.");
  const caseId = data?.[0]?.counseling_case_id;
  return caseId ? getCoupleAssessmentSummaries(caseId, profileId) : [];
}

export async function getCoupleAssessmentSummaries(caseId: string, profileId: string): Promise<CoupleAssessmentSummary[]> {
  const supabase = await createServerSupabaseClient();
  const { data: assignments, error } = await supabase.from("assessment_participant_assignments")
    .select("id,assessment_schedule_id").eq("counseling_case_id", caseId).eq("profile_id", profileId).order("assigned_at");
  if (error) throw new Error("Assessments are unavailable.");
  const assignmentRows = assignments ?? [];
  if (!assignmentRows.length) return [];
  const scheduleIds = [...new Set(assignmentRows.map((row) => row.assessment_schedule_id))];
  const { data: schedules, error: scheduleError } = await supabase.from("assessment_case_schedules")
    .select("id,assessment_id,assessment_version_id,session_id,case_session_id").in("id", scheduleIds);
  if (scheduleError) throw new Error("Assessments are unavailable.");
  const scheduleRows = schedules ?? [];
  if (!scheduleRows.length) return [];
  const [{ data: definitions, error: definitionsError }, { data: sessions, error: sessionsError }, { data: attempts, error: attemptsError }] = await Promise.all([
    supabase.from("assessment_definitions").select("id,title").in("id", [...new Set(scheduleRows.map((row) => row.assessment_id))]),
    supabase.from("sessions").select("id,title").in("id", [...new Set(scheduleRows.map((row) => row.session_id))]),
    supabase.from("assessment_attempts").select("id,participant_assignment_id,status,attempt_number").in("participant_assignment_id", assignmentRows.map((row) => row.id)).eq("profile_id", profileId).eq("attempt_number", 1),
  ]);
  if (definitionsError || sessionsError || attemptsError) throw new Error("Assessments are unavailable.");
  const definitionById = new Map((definitions ?? []).map((row) => [row.id, row.title]));
  const sessionById = new Map((sessions ?? []).map((row) => [row.id, row.title]));
  const attemptByAssignment = new Map((attempts ?? []).map((row) => [row.participant_assignment_id, row]));
  const versions = [...new Set(scheduleRows.filter((row) => row.case_session_id).map((row) => row.assessment_version_id))];
  const { data: questions, error: questionError } = versions.length
    ? await supabase.from("assessment_questions").select("assessment_version_id,id,assessment_choices(id)").in("assessment_version_id", versions)
    : { data: [], error: null };
  if (questionError) throw new Error("Assessments are unavailable.");
  const usableQuestionCounts = new Map<string, { total: number; usable: number }>();
  for (const question of questions ?? []) {
    const counts = usableQuestionCounts.get(question.assessment_version_id) ?? { total: 0, usable: 0 };
    counts.total += 1;
    if (question.assessment_choices?.length === 2) counts.usable += 1;
    usableQuestionCounts.set(question.assessment_version_id, counts);
  }
  const scheduleById = new Map(scheduleRows.map((row) => [row.id, row]));
  return assignmentRows.flatMap((assignment) => {
    const schedule = scheduleById.get(assignment.assessment_schedule_id);
    if (!schedule) return [];
    const attempt = attemptByAssignment.get(assignment.id) ?? null;
    const counts = usableQuestionCounts.get(schedule.assessment_version_id);
    const hasQuestions = Boolean(schedule.case_session_id && counts?.total && counts.usable === counts.total);
    return [{ assignmentId: assignment.id, title: definitionById.get(schedule.assessment_id) ?? "Assessment", sessionTitle: sessionById.get(schedule.session_id) ?? "Assigned Session", status: assessmentStatus(attempt, hasQuestions) }];
  });
}

export async function getCoupleAssessment(profileId: string, assignmentId: string): Promise<CoupleAssessmentData | null> {
  const supabase = await createServerSupabaseClient();
  const { data: assignment, error } = await supabase.from("assessment_participant_assignments")
    .select("id,assessment_schedule_id,profile_id").eq("id", assignmentId).eq("profile_id", profileId).maybeSingle();
  if (error) throw new Error("Assessment is unavailable.");
  if (!assignment) return null;
  const { data: schedule, error: scheduleError } = await supabase.from("assessment_case_schedules")
    .select("id,assessment_id,assessment_version_id,session_id,case_session_id").eq("id", assignment.assessment_schedule_id).maybeSingle();
  if (scheduleError) throw new Error("Assessment is unavailable.");
  if (!schedule) return null;
  const [{ data: definition, error: definitionError }, { data: session, error: sessionError }, { data: attempt, error: attemptError }] = await Promise.all([
    supabase.from("assessment_definitions").select("title").eq("id", schedule.assessment_id).maybeSingle(),
    supabase.from("sessions").select("title").eq("id", schedule.session_id).maybeSingle(),
    supabase.from("assessment_attempts").select("id,status").eq("participant_assignment_id", assignment.id).eq("profile_id", profileId).eq("attempt_number", 1).maybeSingle(),
  ]);
  if (definitionError || sessionError || attemptError) throw new Error("Assessment is unavailable.");
  const { data: questionRows, error: questionsError } = schedule.case_session_id
    ? await supabase.from("assessment_questions").select("id,position,prompt,assessment_choices(id,position,label)").eq("assessment_version_id", schedule.assessment_version_id).order("position")
    : { data: [], error: null };
  if (questionsError) throw new Error("Assessment is unavailable.");
  const questions: CoupleAssessmentQuestion[] = (questionRows ?? []).map((question) => ({
    id: question.id, position: question.position, prompt: question.prompt,
    choices: [...(question.assessment_choices ?? [])].sort((a, b) => a.position - b.position).map(({ id, position, label }) => ({ id, position, label })),
  }));
  let answers: Record<string, string> = {};
  let results: CoupleAssessmentResult[] = [];
  if (attempt) {
    const { data: responseRows, error: responsesError } = await supabase.from("assessment_responses").select("question_id,choice_id").eq("attempt_id", attempt.id).eq("profile_id", profileId);
    if (responsesError) throw new Error("Assessment responses are unavailable.");
    answers = Object.fromEntries((responseRows ?? []).map((response) => [response.question_id, response.choice_id]));
    if (attempt.status === "submitted") {
      const { data: scoreRows, error: scoresError } = await supabase.from("assessment_attempt_scores").select("category_id,score,rank,is_primary").eq("attempt_id", attempt.id);
      if (scoresError) throw new Error("Assessment results are unavailable.");
      const categoryIds = (scoreRows ?? []).map((score) => score.category_id);
      const { data: categories, error: categoriesError } = categoryIds.length
        ? await supabase.from("assessment_categories").select("id,label").in("id", categoryIds)
        : { data: [], error: null };
      if (categoriesError) throw new Error("Assessment results are unavailable.");
      const labels = new Map((categories ?? []).map((category) => [category.id, category.label]));
      results = (scoreRows ?? []).flatMap((score) => labels.has(score.category_id) ? [{ label: labels.get(score.category_id)!, score: score.score, rank: score.rank, isPrimary: score.is_primary }] : []);
    }
  }
  return {
    assignmentId: assignment.id, title: definition?.title ?? "Assessment", sessionTitle: session?.title ?? "Assigned Session",
    status: assessmentStatus(attempt, questions.length > 0 && questions.every((question) => question.choices.length === 2)),
    attemptId: attempt?.id ?? null, questions, answers, results,
  };
}
