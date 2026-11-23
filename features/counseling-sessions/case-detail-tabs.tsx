"use client";

import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsListViewport, TabsTrigger } from "@/components/ui/tabs";

export function CaseDetailTabs({ session, homework, meetings, settings, defaultTab = "session" }: {
  session: ReactNode;
  homework: ReactNode;
  meetings: ReactNode;
  settings: ReactNode;
  defaultTab?: "session" | "homework" | "meetings" | "settings";
}) {
  return <Tabs defaultValue={defaultTab} className="min-w-0">
    <TabsListViewport>
      <TabsList aria-label="Counseling case sections" className="min-w-max justify-start">
        <TabsTrigger value="session">Session</TabsTrigger>
        <TabsTrigger value="homework">Homework</TabsTrigger>
        <TabsTrigger value="meetings">Meetings &amp; Reminders</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
    </TabsListViewport>
    <TabsContent value="session">{session}</TabsContent>
    <TabsContent value="homework">{homework}</TabsContent>
    <TabsContent value="meetings">{meetings}</TabsContent>
    <TabsContent value="settings">{settings}</TabsContent>
  </Tabs>;
}
