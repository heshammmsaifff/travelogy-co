/**
 * What a CRM record IS, in business terms — no framework imports (§6).
 *
 * These live here rather than in the repository because BOTH sides need them:
 * the repository maps them out of Postgres, and the board renders a column per
 * stage. The repository carries `import "server-only"`, so a `"use client"`
 * component importing from it breaks the client build.
 *
 * That is the third time this exact shape has appeared in this project —
 * `buttonVariants` (§15, Phase 4), `OCCUPANCIES` (§15, Phase 8c), and here.
 * **The rule that prevents a fourth: a value both sides need goes in
 * `domain/` first, and the repository imports it from there.**
 */

export type LeadStage = "new" | "contacted" | "qualified" | "proposal" | "won" | "lost";

export type LeadSource =
  | "referral"
  | "website"
  | "exhibition"
  | "cold_call"
  | "social"
  | "existing_client"
  | "other";

export type ActivityKind = "call" | "email" | "meeting" | "whatsapp" | "note";

export type TaskStatus = "open" | "done" | "cancelled";

/** The pipeline's order, which is the database enum's declaration order. */
export const LEAD_STAGES: readonly LeadStage[] = [
  "new",
  "contacted",
  "qualified",
  "proposal",
  "won",
  "lost",
];

export const LEAD_SOURCES: readonly LeadSource[] = [
  "referral",
  "website",
  "exhibition",
  "cold_call",
  "social",
  "existing_client",
  "other",
];

export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  "call",
  "email",
  "meeting",
  "whatsapp",
  "note",
];
