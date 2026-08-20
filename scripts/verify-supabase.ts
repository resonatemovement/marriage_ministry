import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

function getFailureContext(error: unknown) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function getResponseError(response: Response) {
  const fallback = response.statusText || "No response message";

  if (!response.headers.get("content-type")?.includes("application/json")) {
    return fallback;
  }

  const payload: unknown = await response.json().catch(() => undefined);
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const details = ["message", "error", "error_description", "code"]
    .map((key) => {
      const value = (payload as Record<string, unknown>)[key];
      return typeof value === "string" ? `${key}=${value}` : undefined;
    })
    .filter(Boolean);

  return details.join(", ") || fallback;
}

const { url, publishableKey } = getSupabaseEnvironment();
let response: Response;

try {
  response = await fetch(new URL("/auth/v1/settings", url), {
    headers: {
      accept: "application/json",
      apikey: publishableKey,
    },
  });
} catch (error) {
  throw new Error(`Supabase DEV connectivity verification failed: ${getFailureContext(error)}`);
}

if (!response.ok) {
  const details = await getResponseError(response);
  throw new Error(
    `Supabase DEV connectivity verification failed: HTTP ${response.status} ${details}`,
  );
}

console.log("Supabase DEV connectivity verified via Auth settings API (HTTP 200).");
