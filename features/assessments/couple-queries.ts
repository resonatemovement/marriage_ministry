import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { assessmentStatus, type CoupleAssessmentHistoryItem, type CoupleAssessmentPartnerResults, type CoupleAssessmentQuestion, type CoupleAssessmentResult, type CoupleAssessmentStatus } from "./couple-model";

export type CoupleAssessmentSummary = {
  assignmentId: string;
  title: string;
  sessionTitle: string;
  status: CoupleAssessmentStatus;
};

export type CoupleAssessmentData = CoupleAssessmentSummary & {
  profileName: string;
  attemptId: string | null;
  activeRetakeId: string | null;
  activeRetakeAnswers: Record<string, string>;
  questions: CoupleAssessmentQuestion[];
  answers: Record<string, string>;
  results: CoupleAssessmentResult[];
  history: CoupleAssessmentHistoryItem[];
  partnerResults: CoupleAssessmentPartnerResults | null;
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
  const [{ data: definition, error: definitionError }, { data: session, error: sessionError }, { data: attempts, error: attemptsError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.from("assessment_definitions").select("title").eq("id", schedule.assessment_id).maybeSingle(),
    supabase.from("sessions").select("title").eq("id", schedule.session_id).maybeSingle(),
    supabase.from("assessment_attempts").select("id,status,attempt_number,submitted_at").eq("participant_assignment_id", assignment.id).eq("profile_id", profileId).order("attempt_number", { ascending: false }),
    supabase.from("profiles").select("first_name,last_name").eq("id", profileId).maybeSingle(),
  ]);
  if (definitionError || sessionError || attemptsError || profileError) throw new Error("Assessment is unavailable.");
  const ownAttempts = attempts ?? [];
  const initialAttempt = ownAttempts.find((row) => row.attempt_number === 1) ?? null;
  const activeRetake = ownAttempts.find((row) => row.attempt_number > 1 && row.status === "in_progress") ?? null;
  const submittedAttempts = ownAttempts.filter((row) => row.status === "submitted" && row.submitted_at);
  const { data: questionRows, error: questionsError } = schedule.case_session_id
    ? await supabase.from("assessment_questions").select("id,position,prompt,assessment_choices(id,position,label)").eq("assessment_version_id", schedule.assessment_version_id).order("position")
    : { data: [], error: null };
  if (questionsError) throw new Error("Assessment is unavailable.");
  const questions: CoupleAssessmentQuestion[] = (questionRows ?? []).map((question) => ({
    id: question.id, position: question.position, prompt: question.prompt,
    choices: [...(question.assessment_choices ?? [])].sort((a, b) => a.position - b.position).map(({ id, position, label }) => ({ id, position, label })),
  }));
  const answersByAttempt = new Map<string, Record<string, string>>();
  const attemptIds = [...new Set([initialAttempt?.status === "in_progress" ? initialAttempt.id : null, activeRetake?.id ?? null].filter((id): id is string => Boolean(id)))];
  if (attemptIds.length) {
    const { data: responseRows, error: responsesError } = await supabase.from("assessment_responses").select("attempt_id,question_id,choice_id").in("attempt_id", attemptIds).eq("profile_id", profileId);
    if (responsesError) throw new Error("Assessment responses are unavailable.");
    for (const response of responseRows ?? []) answersByAttempt.set(response.attempt_id, { ...(answersByAttempt.get(response.attempt_id) ?? {}), [response.question_id]: response.choice_id });
  }
  const submittedAttemptIds = submittedAttempts.map((row) => row.id);
  const { data: allScoreRows, error: scoresError } = submittedAttemptIds.length
    ? await supabase.from("assessment_attempt_scores").select("attempt_id,category_id,score,rank,is_primary").in("attempt_id", submittedAttemptIds)
    : { data: [], error: null };
  if (scoresError) throw new Error("Assessment results are unavailable.");
  const categoryIds = [...new Set((allScoreRows ?? []).map((score) => score.category_id))];
  const { data: categories, error: categoriesError } = categoryIds.length
    ? await supabase.from("assessment_categories").select("id,label").in("id", categoryIds)
    : { data: [], error: null };
  if (categoriesError) throw new Error("Assessment results are unavailable.");
  const labels = new Map((categories ?? []).map((category) => [category.id, category.label]));
  const resultsByAttempt = new Map<string, CoupleAssessmentResult[]>();
  for (const score of allScoreRows ?? []) {
    const label = labels.get(score.category_id);
    if (label) resultsByAttempt.set(score.attempt_id, [...(resultsByAttempt.get(score.attempt_id) ?? []), { label, score: score.score, rank: score.rank, isPrimary: score.is_primary }]);
  }
  const history: CoupleAssessmentHistoryItem[] = submittedAttempts.flatMap((row) => row.submitted_at
    ? [{ attemptNumber: row.attempt_number, submittedAt: row.submitted_at, results: resultsByAttempt.get(row.id) ?? [] }]
    : []);
  const latestHistory = history[0];
  const ownInitialComplete = initialAttempt?.status === "submitted";
  let partnerResults: CoupleAssessmentPartnerResults | null = null;
  if (schedule.case_session_id && ownInitialComplete) {
    const { data: partnerRows, error: partnerError } = await supabase.rpc("get_partner_assessment_score_history", { target_schedule_id: schedule.id });
    if (partnerError) throw new Error("Partner results are unavailable.");
    if (partnerRows?.length) {
      const first = partnerRows[0];
      const partnerScores = partnerRows.map((row) => ({ label: row.category_label, score: row.score, rank: row.rank, isPrimary: row.is_primary }));
      partnerResults = { name: first.partner_name || "Your partner", submittedAt: first.submitted_at, results: partnerScores };
    }
  }
  return {
    assignmentId: assignment.id, title: definition?.title ?? "Assessment", sessionTitle: session?.title ?? "Assigned Session",
    status: assessmentStatus(initialAttempt, questions.length > 0 && questions.every((question) => question.choices.length === 2)),
    profileName: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Your",
    attemptId: initialAttempt?.status === "in_progress" ? initialAttempt.id : null,
    activeRetakeId: activeRetake?.id ?? null,
    activeRetakeAnswers: activeRetake ? answersByAttempt.get(activeRetake.id) ?? {} : {},
    questions,
    answers: initialAttempt?.status === "in_progress" ? answersByAttempt.get(initialAttempt.id) ?? {} : {},
    results: latestHistory?.results ?? [], history, partnerResults,
  };
}
