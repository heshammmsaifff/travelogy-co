import { z } from "zod";

/**
 * Environment validation.
 *
 * CLAUDE.md §2.6 / §14: "Never invent secrets. If an environment variable is
 * missing, stop and ask for it — never hardcode a fake key or silently disable
 * the feature that needs it." This module is how that rule is enforced at
 * runtime: a missing or malformed variable throws a named, actionable error at
 * first use instead of failing deep inside an SDK call.
 *
 * Split into two schemas because `process.env` is only fully populated on the
 * server — NEXT_PUBLIC_* values are inlined into the client bundle at build
 * time, everything else is server-only and must never be imported from a
 * client component.
 */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  // Supabase renamed the anon key to the "publishable" key (sb_publishable_…).
  // CLAUDE.md §4 still names it NEXT_PUBLIC_SUPABASE_ANON_KEY; we accept either
  // so an older .env keeps working, and prefer the current name.
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});

function parse<T extends z.ZodType>(
  schema: T,
  source: Record<string, unknown>,
  scope: string,
): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(
      `Invalid ${scope} environment configuration:\n${missing.join("\n")}\n\n` +
        `Add the missing values to .env.local (see .env.example). Do not substitute placeholder values.`,
    );
  }

  return result.data;
}

/**
 * Client-safe environment. Every reference must be a literal `process.env.X`
 * so Next can statically inline it into the browser bundle.
 */
export const clientEnv = parse(
  clientSchema,
  {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
  "client",
);

/**
 * Server-only environment. Reading this from a client component is a build
 * error in Next (the values simply aren't there), which is the intended guard.
 * Lazily evaluated so importing a module that touches it doesn't blow up a
 * client bundle that never actually calls it.
 */
let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

export function getServerEnv(): z.infer<typeof serverSchema> {
  if (cachedServerEnv) return cachedServerEnv;

  cachedServerEnv = parse(
    serverSchema,
    {
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    },
    "server",
  );

  return cachedServerEnv;
}
