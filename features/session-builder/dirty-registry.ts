const DIRTY_PREFIX = "resonate:session-builder:dirty:";
const MOVE_EVENT_KEY = "resonate:session-builder:content-moved";
const MARKER_TTL_MS = 2 * 60 * 1000;

function markerPrefix(sessionId: string) {
  return `${DIRTY_PREFIX}${sessionId}:`;
}

export function hasUnsavedSessionBuilderChangesInOtherTab(sessionId: string): boolean | null {
  try {
    const prefix = markerPrefix(sessionId);
    const now = Date.now();
    let dirty = false;
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const writtenAt = Number(localStorage.getItem(key));
      if (!Number.isFinite(writtenAt) || now - writtenAt > MARKER_TTL_MS) localStorage.removeItem(key);
      else dirty = true;
    }
    return dirty;
  } catch {
    return null;
  }
}

export function announceSessionBuilderContentMoved(sessionIds: string[]) {
  try {
    localStorage.setItem(MOVE_EVENT_KEY, JSON.stringify({ sessionIds, at: Date.now(), nonce: crypto.randomUUID() }));
  } catch {
    // Database revisions remain the authoritative stale-write protection.
  }
}

export function sessionBuilderMoveEventKey() {
  return MOVE_EVENT_KEY;
}

export function sessionBuilderDirtyMarkerKey(sessionId: string, tabId: string) {
  return `${markerPrefix(sessionId)}${tabId}`;
}

export const SESSION_BUILDER_DIRTY_MARKER_TTL_MS = MARKER_TTL_MS;
