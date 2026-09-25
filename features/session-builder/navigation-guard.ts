type NavigationClick = {
  href: string;
  currentHref: string;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  target?: string | null;
  download?: boolean;
  sessionId?: string;
};

function isWorkspaceNavigation(current: URL, destination: URL, sessionId?: string) {
  if (!sessionId || current.pathname !== destination.pathname || current.pathname !== `/session-builder/${sessionId}`) return false;
  const currentWorkspace = current.searchParams.get("workspace") ?? "material";
  const destinationWorkspace = destination.searchParams.get("workspace") ?? "material";
  return currentWorkspace !== destinationWorkspace && ["material", "homework"].includes(currentWorkspace) && ["material", "homework"].includes(destinationWorkspace);
}

export function eligibleInternalNavigation({ href, currentHref, button = 0, metaKey = false, ctrlKey = false, shiftKey = false, altKey = false, target, download = false, sessionId }: NavigationClick): string | null {
  if (button !== 0 || metaKey || ctrlKey || shiftKey || altKey || target?.toLowerCase() === "_blank" || download) return null;
  const current = new URL(currentHref);
  const destination = new URL(href, current);
  if (destination.origin !== current.origin || isWorkspaceNavigation(current, destination, sessionId)) return null;
  if (destination.pathname === current.pathname && destination.search === current.search) return null;
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
