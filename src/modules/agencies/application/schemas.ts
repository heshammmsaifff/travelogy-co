import { z } from "zod";

import { isCountryCode } from "@/shared/lib/countries";

/** Agency management schemas (CLAUDE.md §13, Phase 2). Messages are i18n keys. */

export const AGENCY_STATUSES = ["pending", "active", "suspended", "rejected"] as const;

export const agencyListFiltersSchema = z.object({
  status: z.enum(AGENCY_STATUSES).optional(),
  /** Free-text match on name, code or email. */
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type AgencyListFilters = z.infer<typeof agencyListFiltersSchema>;

export const rejectAgencySchema = z.object({
  agencyId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(5, "agencies.validation.reasonRequired")
    .max(500, "agencies.validation.reasonTooLong"),
});

export const creditLimitSchema = z.object({
  agencyId: z.string().uuid(),
  // Stored as numeric(14,2): two decimals, and comfortably under the column's
  // precision so a legitimate value can never be silently truncated.
  creditLimit: z.coerce
    .number({ message: "agencies.validation.creditLimitInvalid" })
    .min(0, "agencies.validation.creditLimitNegative")
    .max(999_999_999.99, "agencies.validation.creditLimitTooLarge"),
});

export const updateAgencySchema = z.object({
  agencyId: z.string().uuid(),
  name: z.string().trim().min(2, "agencies.validation.nameRequired").max(200),
  legalName: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  website: z.string().trim().max(200).optional().or(z.literal("")),
  countryCode: z
    .string()
    .trim()
    .length(2, "auth.validation.countryRequired")
    .toUpperCase()
    .refine(isCountryCode, "auth.validation.countryRequired"),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().or(z.literal("")),
  commercialRegNo: z.string().trim().max(60).optional().or(z.literal("")),
  taxId: z.string().trim().max(60).optional().or(z.literal("")),
});
export type UpdateAgencyInput = z.infer<typeof updateAgencySchema>;

export const createAgencyUserSchema = z.object({
  agencyId: z.string().uuid(),
  fullName: z.string().trim().min(2, "auth.validation.nameRequired").max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "auth.validation.emailRequired")
    .email("auth.validation.emailInvalid"),
  roleId: z.string().uuid("access.validation.roleRequired"),
});
export type CreateAgencyUserInput = z.infer<typeof createAgencyUserSchema>;

export const setAgencyUserStatusSchema = z.object({
  agencyId: z.string().uuid(),
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
});
export type SetAgencyUserStatusInput = z.infer<typeof setAgencyUserStatusSchema>;

