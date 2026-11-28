"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionSummary } from "./types";

type SessionBuilderMoveContextValue = {
  sessions: SessionSummary[];
  sourceSession: SessionSummary | null;
  sourceCanMove: boolean;
  refreshAfterMove: () => void;
};

const SessionBuilderMoveContext = createContext<SessionBuilderMoveContextValue | null>(null);

export function SessionBuilderMoveProvider({ value, children }: { value: SessionBuilderMoveContextValue; children: ReactNode }) {
  return <SessionBuilderMoveContext.Provider value={value}>{children}</SessionBuilderMoveContext.Provider>;
}

export function useSessionBuilderMoveContext() {
  const value = useContext(SessionBuilderMoveContext);
  return value ?? { sessions: [], sourceSession: null, sourceCanMove: false, refreshAfterMove: () => undefined };
}
