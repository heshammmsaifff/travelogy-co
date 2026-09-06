"use client";

import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/shared/lib/env";
import type { Database } from "@/shared/types/database";

/**
 * Browser Supabase client, for use inside client components only.
 *
 * `createBrowserClient` memoises internally, so calling this per component is
 * cheap and does not open a new connection each time (CLAUDE.md §11).
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
