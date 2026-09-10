import { z } from "zod";

import { isCountryCode } from "@/shared/lib/countries";

/** CRM input schemas (CLAUDE.md §13, Phase 8d). */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalUuid = () =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().uuid().optional(),
  );

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const leadSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    companyName: z.string().trim().min(2).max(200),
    contactName: optionalText(200),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().email().max(200).optional(),
    ),
    phone: optionalText(40),
    countryCode: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().toUpperCase().length(2).refine(isCountryCode).optional(),
    ),
    city: optionalText(120),
    source: z.enum([
      "referral",
      "website",
      "exhibition",
      "cold_call",
      "social",
      "existing_client",
      "other",
    ]),
    stage: z.enum(["new", "contacted", "qualified", "proposal", "won", "lost"]),
    ownerId: optionalUuid(),
    lostReason: optionalText(500),
    notes: optionalText(4000),
  })
  // The database enforces both of these as CHECK constraints; catching them
  // here turns a constraint violation into a message on the right field.
  .refine((d) => d.stage !== "lost" || Boolean(d.lostReason), {
    path: ["lostReason"],
    message: "crm.errors.lostNeedsReason",
  })
  // `won` is deliberately unreachable from this form: winning a lead links it
  // to an agency, and that is `convert_lead`'s job, not a dropdown's.
  .refine((d) => d.stage !== "won", {
    path: ["stage"],
    message: "crm.errors.wonNeedsAgency",
  });

export const activitySchema = z
  .object({
    leadId: optionalUuid(),
    agencyId: optionalUuid(),
    kind: z.enum(["call", "email", "meeting", "whatsapp", "note"]),
    subject: z.string().trim().min(2).max(200),
    body: optionalText(4000),
    // `datetime-local` submits without a zone; the action normalises it.
    occurredAt: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().optional(),
    ),
  })
  .refine((d) => Boolean(d.leadId) !== Boolean(d.agencyId), {
    path: ["leadId"],
    message: "crm.errors.invalidInput",
  });

export const taskSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    leadId: optionalUuid(),
    agencyId: optionalUuid(),
    title: z.string().trim().min(2).max(200),
    notes: optionalText(2000),
    dueOn: isoDate,
    assignedTo: optionalUuid(),
  })
  .refine((d) => Boolean(d.leadId) !== Boolean(d.agencyId), {
    path: ["leadId"],
    message: "crm.errors.invalidInput",
  });

export const convertLeadSchema = z.object({
  leadId: z.string().uuid(),
  agencyId: z.string().uuid(),
});

export type LeadInput = z.infer<typeof leadSchema>;
