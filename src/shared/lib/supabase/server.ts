import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv, getServerEnv } from "@/shared/lib/env";
import type { Database } from "@/shared/types/database";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. Runs as the signed-in user, so Row Level Security applies —
 * this is the client to reach for by default (CLAUDE.md §7, §12).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Session refresh happens in
            // src/proxy.ts instead, so this is safe to swallow here.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely — use only for genuinely
 * privileged server-side work (admin provisioning, webhooks, scheduled jobs),
 * never to sidestep a policy that should have been written properly.
 *
 * Every call site must re-check the caller's role in the application layer
 * first (CLAUDE.md §12: "Never trust a role/permission claim from the client").
 */
export function createServiceRoleClient() {
  const serverEnv = getServerEnv();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {
          // Service-role client is stateless: it must never adopt a user session.
        },
      },
    },
  );
}
