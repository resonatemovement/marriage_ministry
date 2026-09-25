import { initializeHomeworkDraftForSession } from "./queries";
import { HomeworkBuilderContent } from "./homework-builder-content";

export async function HomeworkBuilder({ sessionId, sessionStatus }: { sessionId: string; sessionStatus: "draft" | "published" }) {
  const result = await initializeHomeworkDraftForSession(sessionId, sessionStatus);
  return <HomeworkBuilderContent result={result} />;
}
