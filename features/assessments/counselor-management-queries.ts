import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { projectCounselorAssessmentPartners, type CounselorAssessment, type CounselorAssessmentRows, type CounselorAssessmentSession } from "./counselor-management-model";

type CatalogRow = { assessment_id: string; title: string; description: string | null; published_version_id: string | null; published_version_number: number | null; system_default_session_id: string | null };
type ScheduleRow = { id: string; assessment_id: string; assessment_version_id: string; session_id: string; case_session_id: string | null; progression_case_session_id: string | null; required_for_progression: boolean; schedule_source: string };

export async function getCounselorAssessmentManagement(
  caseId: string,
  partners: { id: string; name: string }[],
  canReadResults: boolean,
  counselorProfileId: string | null,
): Promise<{ assessments: CounselorAssessment[]; sessions: CounselorAssessmentSession[]; preferences: Record<string, string> }> {
  const supabase = await createServerSupabaseClient();
  const [catalogResult, schedulesResult, sessionsResult, preferencesResult] = await Promise.all([
    supabase.rpc("get_case_assessment_catalog", { target_case_id: caseId }),
    supabase.from("assessment_case_schedules").select("id,assessment_id,assessment_version_id,session_id,case_session_id,progression_case_session_id,required_for_progression,schedule_source").eq("counseling_case_id", caseId),
    supabase.from("sessions").select("id,title,sequence_number").eq("status", "published").order("sequence_number"),
    counselorProfileId
      ? supabase.from("assessment_counselor_preferences").select("assessment_id,session_id").eq("counselor_profile_id", counselorProfileId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (catalogResult.error || schedulesResult.error || sessionsResult.error || preferencesResult.error) {
    console.error("Counselor Assessment management query failed.", { caseId, code: catalogResult.error?.code ?? schedulesResult.error?.code ?? sessionsResult.error?.code ?? preferencesResult.error?.code });
    throw new Error("Assessment management is unavailable.");
  }

  const catalog = (catalogResult.data ?? []) as CatalogRow[];
  const schedules = (schedulesResult.data ?? []) as ScheduleRow[];
  const sessions = (sessionsResult.data ?? []).map((session) => ({ id: session.id, title: session.title, sequenceNumber: session.sequence_number }));
  const preferences = Object.fromEntries((preferencesResult.data ?? []).map((preference) => [preference.assessment_id, preference.session_id]));
  let assessmentRows: CounselorAssessmentRows = { assignments: [], attempts: [], scores: [], categories: [] };

  if (canReadResults) {
    const { data: assignmentRows, error: assignmentError } = await supabase.from("assessment_participant_assignments")
      .select("id,profile_id,assessment_schedule_id").eq("counseling_case_id", caseId);
    if (assignmentError) throw new Error("Assessment status is unavailable.");
    const assignments = (assignmentRows ?? []).map((row) => ({ id: row.id, profileId: row.profile_id, scheduleId: row.assessment_schedule_id }));
    if (assignments.length) {
      const { data: attemptRows, error: attemptError } = await supabase.from("assessment_attempts")
        .select("id,participant_assignment_id,profile_id,attempt_number,status,submitted_at")
        .in("participant_assignment_id", assignments.map(({ id }) => id));
      if (attemptError) throw new Error("Assessment status is unavailable.");
      const attempts = (attemptRows ?? []).map((row) => ({ id: row.id, assignmentId: row.participant_assignment_id, profileId: row.profile_id, attemptNumber: row.attempt_number, status: row.status, submittedAt: row.submitted_at }));
      const submittedAttemptIds = attempts.filter((attempt) => attempt.status === "submitted").map((attempt) => attempt.id);
      let scores: CounselorAssessmentRows["scores"] = [];
      let categories: CounselorAssessmentRows["categories"] = [];
      if (submittedAttemptIds.length) {
        const { data: scoreRows, error: scoreError } = await supabase.from("assessment_attempt_scores")
          .select("attempt_id,category_id,score,rank,is_primary").in("attempt_id", submittedAttemptIds);
        if (scoreError) throw new Error("Assessment results are unavailable.");
        scores = (scoreRows ?? []).map((row) => ({ attemptId: row.attempt_id, categoryId: row.category_id, score: row.score, rank: row.rank, isPrimary: row.is_primary }));
        const categoryIds = [...new Set(scores.map((score) => score.categoryId))];
        if (categoryIds.length) {
          const { data: categoryRows, error: categoryError } = await supabase.from("assessment_categories")
            .select("id,label").in("id", categoryIds);
          if (categoryError) throw new Error("Assessment results are unavailable.");
          categories = (categoryRows ?? []).map(({ id, label }) => ({ id, label }));
        }
      }
      assessmentRows = { assignments, attempts, scores, categories };
    }
  }

  return {
    sessions,
    preferences,
    assessments: catalog.map((definition) => {
      const schedule = schedules.find((row) => row.assessment_id === definition.assessment_id);
      return {
        id: definition.assessment_id,
        title: definition.title,
        description: definition.description,
        publishedVersionId: definition.published_version_id,
        publishedVersionNumber: definition.published_version_number,
        systemDefaultSessionId: definition.system_default_session_id,
        schedule: schedule ? {
          id: schedule.id,
          sessionId: schedule.session_id,
          caseSessionId: schedule.case_session_id,
          progressionCaseSessionId: schedule.progression_case_session_id,
          requiredForProgression: schedule.required_for_progression,
          source: schedule.schedule_source,
        } : null,
        partners: schedule
          ? projectCounselorAssessmentPartners(partners, {
            ...assessmentRows,
            assignments: assessmentRows.assignments.filter((assignment) => assignment.scheduleId === schedule.id),
          })
          : projectCounselorAssessmentPartners(partners, { assignments: [], attempts: [], scores: [], categories: [] }),
      };
    }),
  };
}
