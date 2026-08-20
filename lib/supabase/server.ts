import "server-only";

import { cookies } from "next/headers";

import { createSupabaseServerClient } from "./server-client.ts";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      } catch {
        // Server Components cannot write cookies; proxy.ts refreshes sessions instead.
      }
    },
  });
}
