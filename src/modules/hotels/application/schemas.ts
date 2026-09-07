import { z } from "zod";

/**
 * Hotel module input schemas (CLAUDE.md §3: defined once, used by the form
 * resolver and the Server Action). Messages are i18n keys (§5).
 */

export const HOTEL_STATUSES = ["draft", "active", "inactive"] as const;
export const PROPERTY_TYPES = [
  "hotel",
  "resort",
  "apartment",
  "villa",
  "guesthouse",
  "hostel",
  "boutique",
] as const;
export const CHARGE_TYPES = ["percentage", "fixed", "nights"] as const;
export const OFFER_TYPES = ["early_bird", "long_stay", "free_nights", "discount"] as const;

const bilingual = (field: string, min = 2, max = 200) => ({
  ar: z.string().trim().min(min, `hotels.validation.${field}ArRequired`).max(max),
  en: z.string().trim().min(min, `hotels.validation.${field}EnRequired`).max(max),
});

/** Empty string from an untouched optional input means "not provided". */
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/**
 * An optional number from an HTML input.
 *
 * `z.coerce.number()` turns an untouched field's `""` into `0`, which then
 * fails any `.min(1)` — so `.optional()` alone does not make a numeric field
 * optional in a form. Every blank "max stay", "size", "star rating" and
 * "minimum nights" was being rejected as invalid because of it. Stripping the
 * empty string to `undefined` *before* coercion is what actually makes it
 * optional.
 */
const optionalNumber = (opts: { min?: number; max?: number; int?: boolean } = {}) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    (() => {
      let n = z.coerce.number();
      if (opts.int) n = n.int();
      if (opts.min !== undefined) n = n.min(opts.min);
      if (opts.max !== undefined) n = n.max(opts.max);
      return n.optional();
    })(),
  );

/** ISO date, and a real one — `2026-02-31` parses as a string but is not a date. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "hotels.validation.dateInvalid")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "hotels.validation.dateInvalid");

// ------------------------------------------------------------------- hotels

export const hotelListFiltersSchema = z.object({
  status: z.enum(HOTEL_STATUSES).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export type HotelListFilters = z.infer<typeof hotelListFiltersSchema>;

export const hotelDetailsSchema = z.object({
  nameAr: bilingual("name").ar,
  nameEn: bilingual("name").en,
  descriptionAr: optionalText(4000),
  descriptionEn: optionalText(4000),

  propertyType: z.enum(PROPERTY_TYPES),
  starRating: optionalNumber({ min: 1, max: 7, int: true }),

  countryCode: z.string().trim().length(2, "auth.validation.countryRequired").toUpperCase(),
  cityAr: bilingual("city", 2, 120).ar,
  cityEn: bilingual("city", 2, 120).en,
  areaAr: optionalText(120),
  areaEn: optionalText(120),
  addressAr: optionalText(400),
  addressEn: optionalText(400),
  latitude: optionalNumber({ min: -90, max: 90 }),
  longitude: optionalNumber({ min: -180, max: 180 }),

  phone: optionalText(30),
  email: z.union([z.string().trim().email("auth.validation.emailInvalid"), z.literal("")]),
  website: optionalText(200),

  checkInTime: z.string().regex(/^\d{2}:\d{2}$/, "hotels.validation.timeInvalid"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/, "hotels.validation.timeInvalid"),

  internalNotes: optionalText(2000),
});
export type HotelDetailsInput = z.infer<typeof hotelDetailsSchema>;

export const createHotelSchema = hotelDetailsSchema;
export const updateHotelSchema = hotelDetailsSchema.extend({ hotelId: z.string().uuid() });

export const setHotelStatusSchema = z.object({
  hotelId: z.string().uuid(),
  status: z.enum(HOTEL_STATUSES),
});

export const setAmenitiesSchema = z.object({
  hotelId: z.string().uuid(),
  amenityKeys: z.array(z.string()).max(200),
});

// --------------------------------------------------------------- room types

export const roomTypeSchema = z
  .object({
    hotelId: z.string().uuid(),
    roomTypeId: z.string().uuid().optional(),

    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,20}$/, "hotels.validation.roomCodeInvalid"),
    nameAr: bilingual("roomName", 2, 150).ar,
    nameEn: bilingual("roomName", 2, 150).en,
    descriptionAr: optionalText(2000),
    descriptionEn: optionalText(2000),

    standardOccupancy: z.coerce.number().int().min(1).max(10),
    maxAdults: z.coerce.number().int().min(1).max(10),
    maxChildren: z.coerce.number().int().min(0).max(10),
    maxOccupancy: z.coerce.number().int().min(1).max(20),

    sizeSqm: optionalNumber({ min: 1, max: 2000, int: true }),
    bedConfigurationAr: optionalText(200),
    bedConfigurationEn: optionalText(200),
    totalRooms: z.coerce.number().int().min(0).max(10000),
  })
  // Mirrors the database CHECK, so the user gets a field-level message instead
  // of a constraint violation surfacing as a generic failure.
  .refine((d) => d.maxOccupancy >= d.standardOccupancy, {
    message: "hotels.validation.occupancyBelowStandard",
    path: ["maxOccupancy"],
  })
  .refine((d) => d.maxOccupancy >= d.maxAdults, {
    message: "hotels.validation.occupancyBelowAdults",
    path: ["maxOccupancy"],
  });
export type RoomTypeInput = z.infer<typeof roomTypeSchema>;

// --------------------------------------------------------------- rate plans

export const ratePlanSchema = z
  .object({
    hotelId: z.string().uuid(),
    ratePlanId: z.string().uuid().optional(),

    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{2,20}$/, "hotels.validation.planCodeInvalid"),
    nameAr: bilingual("planName", 2, 150).ar,
    nameEn: bilingual("planName", 2, 150).en,

    mealPlanKey: z.string().trim().min(2).max(4),
    currencyCode: z.string().trim().length(3).toUpperCase(),
    cancellationPolicyId: z.string().uuid().optional().or(z.literal("")),

    validFrom: isoDate,
    validTo: isoDate,
    status: z.enum(["draft", "active", "inactive"]),
  })
  .refine((d) => d.validTo >= d.validFrom, {
    message: "hotels.validation.endBeforeStart",
    path: ["validTo"],
  });
export type RatePlanInput = z.infer<typeof ratePlanSchema>;

// -------------------------------------------------------------------- rates

export const rateSchema = z
  .object({
    ratePlanId: z.string().uuid(),
    roomTypeId: z.string().uuid(),
    rateId: z.string().uuid().optional(),

    /** Inclusive first night. */
    dateFrom: isoDate,
    /**
     * Inclusive LAST NIGHT, as an admin thinks of a season. Converted to the
     * half-open `[from, to+1)` the database stores, so two consecutive seasons
     * entered as Jun 1-30 and Jul 1-31 meet exactly rather than overlapping on
     * the 30th or leaving it unpriced.
     */
    dateTo: isoDate,

    pricePerNight: z.coerce.number().min(0).max(9_999_999),
    extraAdultPrice: z.coerce.number().min(0).max(9_999_999).default(0),
    extraChildPrice: z.coerce.number().min(0).max(9_999_999).default(0),
    singleOccupancyPrice: optionalNumber({ min: 0, max: 9_999_999 }),

    minStay: z.coerce.number().int().min(1).max(365).default(1),
    maxStay: optionalNumber({ min: 1, max: 365, int: true }),
    isClosed: z.boolean().default(false),
  })
  .refine((d) => d.dateTo >= d.dateFrom, {
    message: "hotels.validation.endBeforeStart",
    path: ["dateTo"],
  })
  .refine((d) => d.maxStay == null || d.maxStay >= d.minStay, {
    message: "hotels.validation.maxStayBelowMin",
    path: ["maxStay"],
  });
export type RateInput = z.infer<typeof rateSchema>;

// ----------------------------------------------------------------- policies

export const cancellationPolicySchema = z.object({
  hotelId: z.string().uuid(),
  policyId: z.string().uuid().optional(),
  nameAr: bilingual("policyName", 2, 150).ar,
  nameEn: bilingual("policyName", 2, 150).en,
  descriptionAr: optionalText(1000),
  descriptionEn: optionalText(1000),
  isNonRefundable: z.boolean().default(false),
});

export const cancellationRuleSchema = z
  .object({
    policyId: z.string().uuid(),
    hoursBeforeCheckin: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 365),
    chargeType: z.enum(CHARGE_TYPES),
    chargeValue: z.coerce.number().min(0).max(9_999_999),
  })
  .refine((d) => d.chargeType !== "percentage" || d.chargeValue <= 100, {
    message: "hotels.validation.percentageOver100",
    path: ["chargeValue"],
  });

export const childPolicySchema = z
  .object({
    hotelId: z.string().uuid(),
    policyId: z.string().uuid().optional(),
    ageFrom: z.coerce.number().int().min(0).max(17),
    ageTo: z.coerce.number().int().min(0).max(17),
    chargeType: z.enum(CHARGE_TYPES),
    chargeValue: z.coerce.number().min(0).max(9_999_999),
  })
  .refine((d) => d.ageTo >= d.ageFrom, {
    message: "hotels.validation.ageEndBeforeStart",
    path: ["ageTo"],
  })
  .refine((d) => d.chargeType !== "percentage" || d.chargeValue <= 100, {
    message: "hotels.validation.percentageOver100",
    path: ["chargeValue"],
  });

// ------------------------------------------------------------------- offers

export const offerSchema = z
  .object({
    hotelId: z.string().uuid(),
    offerId: z.string().uuid().optional(),
    nameAr: bilingual("offerName", 2, 150).ar,
    nameEn: bilingual("offerName", 2, 150).en,
    descriptionAr: optionalText(1000),
    descriptionEn: optionalText(1000),

    offerType: z.enum(OFFER_TYPES),
    discountType: z.enum(CHARGE_TYPES),
    discountValue: z.coerce.number().min(0).max(9_999_999),

    bookingFrom: z.union([isoDate, z.literal("")]).optional(),
    bookingTo: z.union([isoDate, z.literal("")]).optional(),
    stayFrom: isoDate,
    stayTo: isoDate,

    minNights: optionalNumber({ min: 1, max: 365, int: true }),
    freeNights: optionalNumber({ min: 1, max: 365, int: true }),
    isActive: z.boolean().default(true),
  })
  .refine((d) => d.stayTo >= d.stayFrom, {
    message: "hotels.validation.endBeforeStart",
    path: ["stayTo"],
  })
  .refine(
    (d) =>
      d.offerType !== "free_nights" ||
      (d.freeNights != null && d.minNights != null && d.minNights > d.freeNights),
    { message: "hotels.validation.freeNightsNeedsMin", path: ["freeNights"] },
  )
  .refine((d) => d.discountType !== "percentage" || d.discountValue <= 100, {
    message: "hotels.validation.percentageOver100",
    path: ["discountValue"],
  });
export type OfferInput = z.infer<typeof offerSchema>;

// -------------------------------------------------------------- allocations

export const allocationBulkSchema = z
  .object({
    roomTypeId: z.string().uuid(),
    dateFrom: isoDate,
    dateTo: isoDate,
    allotment: z.coerce.number().int().min(0).max(10000),
    stopSell: z.boolean().default(false),
    minStay: optionalNumber({ min: 1, max: 365, int: true }),
    /** Which weekdays the change applies to; empty means every day. */
    weekdays: z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  })
  .refine((d) => d.dateTo >= d.dateFrom, {
    message: "hotels.validation.endBeforeStart",
    path: ["dateTo"],
  })
  .refine(
    (d) => {
      // Guard against a range so long it would write an unbounded number of
      // rows in one request (§11: never an unbounded write either).
      const days =
        (Date.parse(`${d.dateTo}T00:00:00Z`) - Date.parse(`${d.dateFrom}T00:00:00Z`)) / 86_400_000;
      return days <= 730;
    },
    { message: "hotels.validation.rangeTooLong", path: ["dateTo"] },
  );
export type AllocationBulkInput = z.infer<typeof allocationBulkSchema>;

// -------------------------------------------------------------------- media

export const attachImageSchema = z.object({
  hotelId: z.string().uuid(),
  roomTypeId: z.string().uuid().optional().or(z.literal("")),
  cloudinaryPublicId: z.string().trim().min(1).max(300),
  secureUrl: z.string().url().max(1000),
  width: z.coerce.number().int().min(1).optional().nullable(),
  height: z.coerce.number().int().min(1).optional().nullable(),
  bytes: z.coerce.number().int().min(1).optional().nullable(),
  altAr: optionalText(200),
  altEn: optionalText(200),
});
