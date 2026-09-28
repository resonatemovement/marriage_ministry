"use client";

import { createContext, useContext } from "react";

export type SessionPreviewTab = "material" | "homework";
const SessionPreviewContext = createContext<((tab: SessionPreviewTab) => void) | null>(null);

export const SessionPreviewProvider = SessionPreviewContext.Provider;

export function useSessionPreview() {
  return useContext(SessionPreviewContext);
}
