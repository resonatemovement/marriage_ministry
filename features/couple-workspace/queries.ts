import "server-only";

import { getProfilePhotoUrl } from "@/lib/storage/profile-photo";
import { coupleDisplayName } from "@/features/people/types";
import { orderCouplePartners } from "@/features/people/partner-order";
import type { StagedMaterialBlock } from "@/features/session-builder/editor-model";
import { participantHomeworkTitle, type HomeworkProgressStatus } from "@/features/homework/presentation";
import { homeworkAnswerChoicesFromJson, type HomeworkAnswerChoice } from "@/features/homework/selection-question";
import { getCurrentCoupleCounselor } from "@/features/counseling-contacts/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signedResourceAccess } from "@/features/resource-library/server";
import type { ResourceCategory } from "@/features/resource-library/policy";
import type { Json } from "@/types/database.generated";
import type { ParticipantHomework, ParticipantHomeworkAnswer } from "./homework-participant";
import { getCoupleAssessmentSummaries, type CoupleAssessmentSummary } from "@/features/assessments/couple-queries";

type Row = Record<string, unknown>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const string = (row: Row | null | undefined, key: string) => typeof row?.[key] === "string" ? row[key] : null;

export type CoupleWorkspaceData = {
  caseId: string;
  coupleName: string;
  partners: { id: string; name: string; photoUrl: string | null; gender?: "male" | "female" | null }[];
  status: string;
  completed: boolean;
  team: { counselor: { caseId: string; id: string; name: string } | null };
  totalSessions: number;
  currentSession: { id: string; caseSessionId: string; number: number; actualSequence: number; title: string } | null;
  initialMeeting: Meeting | null;
  nextMeeting: Meeting | null;
  homeworkRequired: boolean;
  homeworkRevisionId: string | null;
  homework: { status: HomeworkProgressStatus } | null;
  assessments: CoupleAssessmentSummary[];
};
export type Meeting = { startsAt: string; location: string };

export type CoupleSessionViewData = {
  id: string;
  caseId: string;
  number: number;
  title: string;
  status: "active" | "completed";
  caseCompleted: boolean;
  materials: StagedMaterialBlock[];
  homeworkRequired: boolean;
  homeworkRevisionId: string | null;
  homework: ParticipantHomework | null;
};

export type CoupleSessionReviewData = {
  sessions: { id: string; actualSequence: number; number: number; title: string; status: "active" | "completed" }[];
};

export async function getCoupleWorkspaceData(authenticatedProfileId: string): Promise<CoupleWorkspaceData | null> {
  const supabase = await createServerSupabaseClient();
  const teamResult = await supabase.rpc("get_current_couple_case_team");
  if (teamResult.error) throw new Error("Couple Workspace is unavailable");
  const teamRow = teamResult.data?.[0];
  if (!teamRow) return null;

  const [caseResult, meetingsResult, caseSessionResult, counselor] = await Promise.all([
    supabase.from("counseling_cases").select("id,status,closed_at,couple:groups!counseling_cases_couple_group_id_fkey(name,group_members(ended_at,profile:profiles(id,first_name,last_name,gender,email,photo_path)))").eq("id", teamRow.counseling_case_id).maybeSingle(),
    supabase.from("case_session_meetings").select("case_session_id,session_id,starts_at,location,completed_at,created_at").eq("counseling_case_id", teamRow.counseling_case_id).order("created_at"),
    supabase.from("case_sessions").select("id,session_id,actual_sequence,template_sequence_number,title,status,homework_assignment_revision_id").eq("counseling_case_id", teamRow.counseling_case_id).eq("status", "active").maybeSingle(),
    getCurrentCoupleCounselor(),
  ]);
  for (const [label, error] of [["caseResult", caseResult.error], ["meetingsResult", meetingsResult.error], ["caseSessionResult", caseSessionResult.error]] as const) {
    if (error) console.error(`[Couple Workspace] Query failure: ${label}`, { message: error.message, code: error.code, details: error.details, hint: error.hint });
  }
  if (caseResult.error || meetingsResult.error || caseSessionResult.error || !caseResult.data) throw new Error("Couple Workspace is unavailable");

  const counselingCase = caseResult.data as unknown as Row;
  const couple = counselingCase.couple as Row | null;
  const members = rows(couple?.group_members).filter((member) => member.ended_at === null);
  const partnerRows = members.flatMap((member) => {
    const profile = member.profile as Row | null;
    const id = string(profile, "id");
    if (!id) return [];
    const name = [string(profile, "first_name"), string(profile, "last_name")].filter(Boolean).join(" ") || string(profile, "email") || "Partner";
    return [{ id, name, photoPath: string(profile, "photo_path"), gender: string(profile, "gender") as "male" | "female" | null }];
  });
  const partners = await Promise.all(orderCouplePartners(partnerRows).map(async (partner) => ({ id: partner.id, name: partner.name, gender: partner.gender, photoUrl: await getProfilePhotoUrl(partner.photoPath) })));
  const coupleName = coupleDisplayName(string(couple, "name"), members.map((member) => {
    const profile = member.profile as Row | null;
    return { firstName: string(profile, "first_name"), lastName: string(profile, "last_name"), email: string(profile, "email"), gender: string(profile, "gender") as "male" | "female" | null };
  }), []);
  const meetings = (meetingsResult.data ?? []).map((item) => ({ caseSessionId: item.case_session_id, sessionId: item.session_id, startsAt: item.starts_at, location: item.location, completedAt: item.completed_at }));
  const normalMeetings = meetings.filter((meeting) => meeting.sessionId !== null);
  const activeCaseSession = caseSessionResult.data as unknown as Row | null;
  const currentMeeting = activeCaseSession ? [...normalMeetings].reverse().find((meeting) => meeting.caseSessionId === string(activeCaseSession, "id") && meeting.completedAt === null) ?? null : null;
  const initialMeeting = meetings.find((meeting) => meeting.sessionId === null && meeting.completedAt === null) ?? null;
  const currentSession = activeCaseSession ? { id: string(activeCaseSession, "session_id")!, caseSessionId: string(activeCaseSession, "id")!, number: Number(activeCaseSession.template_sequence_number), actualSequence: Number(activeCaseSession.actual_sequence), title: string(activeCaseSession, "title")! } : null;
  const homeworkRevisionId = string(activeCaseSession, "homework_assignment_revision_id");
  const homeworkStatusResult = homeworkRevisionId ? await supabase.from("homework_participant_progress").select("status").eq("assignment_revision_id", homeworkRevisionId).eq("profile_id", authenticatedProfileId).maybeSingle() : null;
  if (homeworkStatusResult?.error) {
    console.error("[Couple Workspace] Query failure: homeworkStatusResult", { message: homeworkStatusResult.error.message, code: homeworkStatusResult.error.code, details: homeworkStatusResult.error.details, hint: homeworkStatusResult.error.hint });
    throw new Error("Couple Workspace is unavailable");
  }
  const caseId = string(counselingCase, "id")!;
  const assessments = await getCoupleAssessmentSummaries(caseId, authenticatedProfileId);
  return {
    caseId,
    coupleName,
    partners,
    status: string(counselingCase, "status") ?? "active",
    completed: string(counselingCase, "status") === "finished",
    team: { counselor: counselor ? { caseId: counselor.caseId, id: counselor.id, name: counselor.name } : null },
    totalSessions: teamRow.published_session_count,
    currentSession,
    homeworkRequired: Boolean(homeworkRevisionId),
    homeworkRevisionId,
    initialMeeting: initialMeeting ? { startsAt: initialMeeting.startsAt, location: initialMeeting.location } : null,
    nextMeeting: currentMeeting ? { startsAt: currentMeeting.startsAt, location: currentMeeting.location } : initialMeeting ? { startsAt: initialMeeting.startsAt, location: initialMeeting.location } : null,
    homework: homeworkStatusResult?.data?.status ? { status: homeworkStatusResult.data.status as HomeworkProgressStatus } : null,
    assessments,
  };
}

export async function getCompletedCoupleSessionReview(): Promise<CoupleSessionReviewData | null> {
  const supabase = await createServerSupabaseClient();
  const { data: teamRows, error: teamError } = await supabase.rpc("get_current_couple_case_team");
  if (teamError) throw new Error("Session history is unavailable.");
  const caseId = teamRows?.[0]?.counseling_case_id;
  if (!caseId) return null;

  const [{ data: counselingCase, error: caseError }, { data: sessions, error: sessionsError }] = await Promise.all([
    supabase.from("counseling_cases").select("id,status,closed_at").eq("id", caseId).maybeSingle(),
    supabase.from("case_sessions").select("id,actual_sequence,template_sequence_number,title,status").eq("counseling_case_id", caseId).order("actual_sequence"),
  ]);
  if (caseError || sessionsError) throw new Error("Session history is unavailable.");
  if (!counselingCase || counselingCase.status !== "finished" || !counselingCase.closed_at) return null;

  return {
    sessions: (sessions ?? []).flatMap((session) => session.status === "active" || session.status === "completed" ? [{
      id: session.id,
      actualSequence: session.actual_sequence,
      number: session.template_sequence_number,
      title: session.title,
      status: session.status,
    }] : []),
  };
}

export async function getCoupleSessionViewData(authenticatedProfileId: string, caseSessionId: string): Promise<CoupleSessionViewData | null> {
  const supabase = await createServerSupabaseClient();
  const { data: teamRows, error: teamError } = await supabase.rpc("get_current_couple_case_team");
  if (teamError) throw new Error("Session is unavailable.");
  const team = teamRows?.[0];
  if (!team) return null;
  const { data: session, error: sessionError } = await supabase.from("case_sessions")
    .select("id,counseling_case_id,session_id,actual_sequence,template_sequence_number,title,status,homework_assignment_revision_id,case_session_material_blocks(*)")
    .eq("id", caseSessionId).eq("counseling_case_id", team.counseling_case_id).in("status", ["active", "completed"]).maybeSingle();
  if (sessionError) throw new Error("Session is unavailable.");
  if (!session) return null;

  const sessionRow = session as unknown as Row;
  const materialRows = rows(sessionRow.case_session_material_blocks).sort((a, b) => Number(a.position) - Number(b.position));
  const materials = await Promise.all(materialRows.map(async (block): Promise<StagedMaterialBlock> => {
    const resourceId = string(block, "resource_id");
    const versionId = string(block, "resource_version_id");
    let resource: StagedMaterialBlock["resource"] = null;
    if (resourceId && versionId) {
      const { data: version, error: versionError } = await supabase.from("resource_versions").select("id,original_filename,mime_type,size_bytes,created_at").eq("resource_id", resourceId).eq("id", versionId).maybeSingle();
      if (versionError || !version) throw new Error("Released Session Resource is unavailable.");
      const access = await signedResourceAccess(resourceId, { versionId });
      resource = {
        id: resourceId,
        title: string(block, "title") ?? "Resource",
        description: string(block, "description"),
        category: string(block, "resource_category") as ResourceCategory,
        archivedAt: null,
        createdAt: "",
        updatedAt: "",
        canManage: false,
        currentVersion: { originalFilename: version.original_filename, mimeType: version.mime_type, sizeBytes: version.size_bytes, uploadedAt: version.created_at },
        previewUrl: access.signedUrl,
      };
    }
    return {
      key: string(block, "id")!,
      persistedId: string(block, "id"),
      blockType: string(block, "block_type") as StagedMaterialBlock["blockType"],
      title: string(block, "title") ?? "",
      richTextContent: block.rich_text_content as Record<string, unknown> | null,
      url: string(block, "url") ?? "",
      description: string(block, "description") ?? "",
      resourceId,
      resourceVersionId: versionId,
      resourceCategory: string(block, "resource_category") as ResourceCategory | null,
      resource,
    };
  }));
  const homeworkRevisionId = string(sessionRow, "homework_assignment_revision_id");
  const homework = homeworkRevisionId ? await loadParticipantHomework(supabase, authenticatedProfileId, homeworkRevisionId, participantHomeworkTitle(string(sessionRow, "title")!)) : null;
  const status = string(sessionRow, "status");
  if (status !== "active" && status !== "completed") return null;
  const { data: counselingCase, error: caseError } = await supabase.from("counseling_cases")
    .select("status,closed_at")
    .eq("id", string(sessionRow, "counseling_case_id")!)
    .maybeSingle();
  if (caseError) throw new Error("Session is unavailable.");
  return {
    id: string(sessionRow, "id")!,
    caseId: string(sessionRow, "counseling_case_id")!,
    number: Number(sessionRow.template_sequence_number),
    title: string(sessionRow, "title")!,
    status,
    caseCompleted: counselingCase?.status === "finished" && counselingCase.closed_at !== null,
    materials,
    homeworkRequired: Boolean(homeworkRevisionId),
    homeworkRevisionId,
    homework,
  };
}

async function loadParticipantHomework(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, authenticatedProfileId: string, revisionId: string, title: string): Promise<ParticipantHomework | null> {
  const { data: revision, error: revisionError } = await supabase.from("homework_assignment_revisions").select("id,homework_version_id").eq("id", revisionId).maybeSingle();
  if (revisionError || !revision) return null;
  const [{ data: progress, error: progressError }, { data: content, error: contentError }] = await Promise.all([
    supabase.from("homework_participant_progress").select("id,status").eq("assignment_revision_id", revision.id).eq("profile_id", authenticatedProfileId).maybeSingle(),
    supabase.from("homework_version_blocks").select("id,block_type,position,title,rich_text_content,url,description,question_choices,is_required").eq("homework_version_id", revision.homework_version_id).order("position"),
  ]);
  if (progressError || contentError) throw new Error("Homework is unavailable.");
  if (!progress || !content?.length) return null;
  const { data: answers, error: answersError } = await supabase.from("homework_answers").select("homework_version_block_id,answer_text,answer_value").eq("participant_progress_id", progress.id);
  if (answersError) throw new Error("Homework responses are unavailable.");
  const answerMap = new Map((answers ?? []).map((answer) => [answer.homework_version_block_id, answer]));
  return {
    title,
    status: progress.status,
    progressId: progress.id,
    revisionId: revision.id,
    blocks: content.map((block) => {
      const questionChoices = homeworkAnswerChoicesFromJson(block.question_choices);
      return {
        id: block.id,
        type: block.block_type,
        title: block.title,
        content: block.rich_text_content,
        url: block.url,
        description: block.description,
        answer: participantAnswerFromRow(block.block_type, answerMap.get(block.id), questionChoices),
        questionChoices,
        isRequired: block.is_required,
      };
    }),
  };
}

function participantAnswerFromRow(
  blockType: string,
  answer: { answer_text: string; answer_value: Json | null } | undefined,
  questionChoices: HomeworkAnswerChoice[],
): ParticipantHomeworkAnswer {
  if (blockType === "long_answer") return answer?.answer_text ?? "";
  const validChoiceIds = new Set(questionChoices.map((choice) => choice.id));
  if (blockType === "radio_question") {
    return typeof answer?.answer_value === "string" && validChoiceIds.has(answer.answer_value) ? answer.answer_value : "";
  }
  if (blockType === "checkbox_question") {
    if (!Array.isArray(answer?.answer_value)) return [];
    return [...new Set(answer.answer_value.filter((choiceId): choiceId is string => typeof choiceId === "string" && validChoiceIds.has(choiceId)))];
  }
  return "";
}

export async function getCurrentParticipantHomework(authenticatedProfileId: string): Promise<ParticipantHomework | null> {
  const supabase = await createServerSupabaseClient();
  const { data: teamRows, error: teamError } = await supabase.rpc("get_current_couple_case_team");
  if (teamError) throw new Error("Homework is unavailable.");
  const team = teamRows?.[0];
  if (!team) return null;
  const { data: counselingCase, error: caseError } = await supabase.from("counseling_cases").select("status,closed_at").eq("id", team.counseling_case_id).maybeSingle();
  if (caseError) throw new Error("Homework is unavailable.");
  if (!counselingCase || counselingCase.closed_at || ["finished", "inactive"].includes(counselingCase.status)) return null;
  const { data: session, error: sessionError } = await supabase.from("case_sessions").select("id,title,status,homework_assignment_revision_id").eq("counseling_case_id", team.counseling_case_id).eq("status", "active").maybeSingle();
  if (sessionError) throw new Error("Homework is unavailable.");
  if (!session) return null;
  if (!session.homework_assignment_revision_id) return null;
  return loadParticipantHomework(supabase, authenticatedProfileId, session.homework_assignment_revision_id, participantHomeworkTitle(session.title));
}
