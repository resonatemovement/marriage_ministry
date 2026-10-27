"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CaseLifecycleRealtime } from "@/features/counseling-sessions/case-lifecycle-realtime";
import { homeworkProgressBadgeClass, homeworkProgressLabel, participantHomeworkTitle } from "@/features/homework/presentation";
import { SessionMaterialPreviewContent } from "@/features/session-builder/session-preview";
import { ExportSessionMaterialsButton } from "@/features/session-materials-export/export-session-materials-button";
import { ParticipantHomeworkContent } from "./homework-participant";
import type { CoupleSessionViewData } from "./queries";
import { CoupleBreadcrumb } from "./couple-breadcrumb";

export function CoupleSessionView({ session, initialTab = "material" }: { session: CoupleSessionViewData; initialTab?: "material" | "homework" }) {
  const completed = session.status === "completed";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [currentPage, setCurrentPage] = useState(1);
  const [homeworkDirty, setHomeworkDirty] = useState(false);
  const [homeworkStatus, setHomeworkStatus] = useState(session.homework?.status ?? null);
  const totalPages = session.materials.filter((block) => block.blockType === "rich_text").length;
  const homeworkTab = activeTab === "homework";
  const title = homeworkTab ? session.homework?.title ?? participantHomeworkTitle(session.title) : `Session ${session.number}: ${session.title}`;
  const eyebrow = homeworkTab ? "Session Homework" : completed ? "Completed Session" : "Current Session";
  const status = homeworkTab ? homeworkStatus ? homeworkProgressLabel(homeworkStatus) : null : completed ? "Completed" : "Current";
  const statusClass = homeworkTab && homeworkStatus
    ? homeworkProgressBadgeClass(homeworkStatus)
    : completed ? "bg-surface-muted text-text-muted" : "bg-info-soft text-info-strong";

  return <main className="mx-auto max-w-[1100px] p-5 sm:p-8 lg:p-10">
    <CaseLifecycleRealtime caseId={session.caseId} />
    <CoupleBreadcrumb parent="Workspace" current={`Session ${session.number}`} sessionsHref={session.caseCompleted ? "/workspace/sessions" : undefined} />
    <header className="mb-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl font-bold text-text-primary">{title}</h1>
        {status ? <Badge className={statusClass}>{status}</Badge> : null}
      </div>
    </header>
    <Tabs value={activeTab} onValueChange={(value) => {
      if (activeTab === "homework" && value === "material" && homeworkDirty && !window.confirm("You have unsaved Homework changes. Leave without saving?")) return;
      setActiveTab(value as "material" | "homework");
    }}>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        <TabsList aria-label="Session sections" className="w-full sm:w-auto">
          <TabsTrigger value="material" className="flex-1 sm:flex-none">Session Material</TabsTrigger>
          <TabsTrigger value="homework" className="flex-1 sm:flex-none">Homework</TabsTrigger>
        </TabsList>
        {activeTab === "material" ? <ExportSessionMaterialsButton caseSessionId={session.id} className="ml-auto" /> : null}
        {activeTab === "material" && totalPages > 0 ? <p className="ml-auto text-sm font-medium text-text-muted">Page {currentPage} of {totalPages}</p> : null}
      </div>
      <TabsContent value="material" forceMount>
        <SessionMaterialPreviewContent blocks={session.materials} fullWidth pageCountPlacement="external" onPageChange={setCurrentPage} />
      </TabsContent>
      <TabsContent value="homework">
        <ParticipantHomeworkContent homework={session.homework} emptyTitle={session.homeworkRequired ? "Homework unavailable" : "No Homework for this Session"} emptyDescription={session.homeworkRequired ? "Your assigned Homework could not be loaded. Please contact your counseling team." : "There’s nothing you need to complete before your next meeting."} readOnly={completed} showHeader={false} onDirtyChange={setHomeworkDirty} onStatusChange={setHomeworkStatus} />
      </TabsContent>
    </Tabs>
  </main>;
}
