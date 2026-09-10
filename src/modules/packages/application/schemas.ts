import { z } from "zod";

import { isCountryCode } from "@/shared/lib/countries";

/** Package input schemas (CLAUDE.md §13, Phase 8c). */

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** `""` from an untouched number input means "none", not zero (§15, 6.x). */
const countField = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? 0 : v),
    z.coerce.number().int().min(0).max(max),
  );

export const packageSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_-]{1,30}$/, "packages.errors.invalidInput"),
  nameAr: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  summaryAr: optionalText(500),
  summaryEn: optionalText(500),
  countryCode: z.string().trim().toUpperCase().length(2).refine(isCountryCode),
  cityAr: z.string().trim().min(2).max(120),
  cityEn: z.string().trim().min(2).max(120),
  durationNights: z.coerce.number().int().min(1).max(60),
  inclusionsAr: optionalText(2000),
  inclusionsEn: optionalText(2000),
  exclusionsAr: optionalText(2000),
  exclusionsEn: optionalText(2000),
  status: z.enum(["draft", "active", "archived"]),
});

export const packageDaySchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  packageId: z.string().uuid(),
  dayNumber: z.coerce.number().int().min(1).max(61),
  titleAr: z.string().trim().min(2).max(200),
  titleEn: z.string().trim().min(2).max(200),
  bodyAr: optionalText(2000),
  bodyEn: optionalText(2000),
});

export const packageRateSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    packageId: z.string().uuid(),
    occupancy: z.enum(["single", "double", "triple", "child"]),
    netPerPerson: z.coerce.number().min(0).max(99_999_999),
    currencyCode: z.string().trim().toUpperCase().length(3),
    // The admin types the first and LAST departure day; the action converts to
    // the half-open range the database stores (§15, 6.3).
    validFrom: isoDate,
    validTo: isoDate,
    isClosed: checkbox,
  })
  .refine((d) => d.validTo >= d.validFrom, { path: ["validTo"] });

export const packageDepartureSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  packageId: z.string().uuid(),
  departureDate: isoDate,
  capacity: z.coerce.number().int().min(1).max(500),
  isClosed: checkbox,
  notes: optionalText(1000),
  // `return_date` is deliberately absent: a trigger computes it from the
  // package's own length, so a departure cannot disagree with its tour.
});

export const packageSearchSchema = z.object({
  from: isoDate,
  to: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    isoDate.optional(),
  ),
  city: optionalText(120),
  q: optionalText(120),
  travellers: z.coerce.number().int().min(1).max(100).default(1),
});

export const createPackageBookingSchema = z
  .object({
    departureId: z.string().uuid(),
    single: countField(100),
    double: countField(100),
    triple: countField(100),
    children: countField(100),
    leadGuestName: z.string().trim().min(2).max(200),
    leadGuestEmail: optionalText(200),
    leadGuestPhone: optionalText(40),
    specialRequests: optionalText(1000),
    promoCode: optionalText(30),
  })
  // The database refuses an empty booking too; catching it here turns a raised
  // exception into a field message.
  .refine((d) => d.single + d.double + d.triple + d.children > 0, {
    path: ["single"],
    message: "packages.errors.noTravellers",
  });

export type PackageInput = z.infer<typeof packageSchema>;
export type PackageDayInput = z.infer<typeof packageDaySchema>;
export type PackageRateInput = z.infer<typeof packageRateSchema>;
export type PackageDepartureInput = z.infer<typeof packageDepartureSchema>;
