import { z } from "zod";

import { isCountryCode } from "@/shared/lib/countries";

/**
 * Transfer input schemas (CLAUDE.md §13, Phase 8a).
 *
 * Defined once and used on both sides, as §3 requires. The regexes and bounds
 * mirror the database CHECKs deliberately: the constraint is the real rule, and
 * this is how the user hears about it as a field message rather than as a
 * constraint violation.
 */

/** `""` from an untouched number input means "not given", not zero (§15, 6.x). */
const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(max).optional(),
  );

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const vehicleTypeSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,20}$/, "transfers.errors.invalidInput"),
  nameAr: z.string().trim().min(2).max(120),
  nameEn: z.string().trim().min(2).max(120),
  maxPassengers: z.coerce.number().int().min(1).max(60),
  maxLuggage: z.coerce.number().int().min(0).max(200),
  descriptionAr: optionalText(500),
  descriptionEn: optionalText(500),
  isActive: checkbox,
});

export const transferRouteSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_-]{1,30}$/, "transfers.errors.invalidInput"),
  countryCode: z.string().trim().toUpperCase().length(2).refine(isCountryCode),
  cityAr: z.string().trim().min(2).max(120),
  cityEn: z.string().trim().min(2).max(120),
  fromNameAr: z.string().trim().min(2).max(160),
  fromNameEn: z.string().trim().min(2).max(160),
  toNameAr: z.string().trim().min(2).max(160),
  toNameEn: z.string().trim().min(2).max(160),
  direction: z.enum(["arrival", "departure", "point_to_point"]),
  durationMinutes: optionalInt(1440),
  distanceKm: optionalInt(32000),
  isActive: checkbox,
});

export const transferRateSchema = z
  .object({
    id: z.string().uuid().optional().or(z.literal("")),
    routeId: z.string().uuid(),
    vehicleTypeId: z.string().uuid(),
    pricePerVehicle: z.coerce.number().min(0).max(99_999_999),
    currencyCode: z.string().trim().toUpperCase().length(3),
    // The admin types the first and LAST day; the action converts to the
    // half-open range the database stores (§15, 6.3).
    validFrom: isoDate,
    validTo: isoDate,
    isClosed: checkbox,
  })
  .refine((d) => d.validTo >= d.validFrom, { path: ["validTo"] });

/** The agent-facing search, parsed straight from the query string. */
export const transferSearchSchema = z.object({
  date: isoDate,
  passengers: z.coerce.number().int().min(1).max(60).default(2),
  country: optionalText(2),
  city: optionalText(120),
  q: optionalText(120),
});

export const createTransferBookingSchema = z.object({
  routeId: z.string().uuid(),
  vehicleTypeId: z.string().uuid(),
  date: isoDate,
  passengers: z.coerce.number().int().min(1).max(60),
  vehicles: z.coerce.number().int().min(1).max(20),
  leadGuestName: z.string().trim().min(2).max(200),
  leadGuestEmail: optionalText(200),
  leadGuestPhone: optionalText(40),
  pickupTime: z
    .preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
    ),
  flightNumber: optionalText(20),
  pickupNotes: optionalText(500),
  promoCode: optionalText(30),
});

export type VehicleTypeInput = z.infer<typeof vehicleTypeSchema>;
export type TransferRouteInput = z.infer<typeof transferRouteSchema>;
export type TransferRateInput = z.infer<typeof transferRateSchema>;
