import { z } from "zod";

/**
 * Quotation input validation (CLAUDE.md §13, Phase 4).
 *
 * Quotations live in `modules/bookings` rather than a module of their own:
 * §6's module list has no `quotations`, and a quotation is the step before a
 * booking — Phase 5 turns an accepted one into a booking, so keeping both in
 * one module means that conversion is not a cross-module reach.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "hotels.validation.dateInvalid")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "hotels.validation.dateInvalid");

/** Blank optional text arrives as "" from an untouched input, not undefined. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

export const quotationDetailsSchema = z.object({
  title: optionalText(200),
  guestName: optionalText(200),
  validUntil: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    isoDate.optional(),
  ),
  notes: optionalText(2000),
});

export const quotationStatusSchema = z.enum(["draft", "sent", "accepted", "expired"]);

/**
 * One offer being saved onto a quotation.
 *
 * Everything the agent saw is carried across, because a quotation item is a
 * snapshot rather than a pointer at a live rate (see the Phase 4 migration).
 * The prices here are SELL prices — search_availability() never returns a net
 * rate, so there is nothing else this could be (§15, decision 6.1).
 */
export const quotationItemSchema = z.object({
  supplierKey: z.string().trim().min(1).max(60),
  hotelRef: z.string().trim().min(1).max(200),
  roomRef: z.string().trim().min(1).max(200),
  ratePlanRef: z.string().trim().min(1).max(200),
  offerRef: z.string().trim().min(1).max(400),

  hotelNameAr: z.string().trim().min(1).max(300),
  hotelNameEn: z.string().trim().min(1).max(300),
  cityAr: optionalText(200),
  cityEn: optionalText(200),
  countryCode: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().length(2).toUpperCase().optional(),
  ),
  starRating: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(7).optional(),
  ),
  coverUrl: optionalText(600),

  roomNameAr: z.string().trim().min(1).max(300),
  roomNameEn: z.string().trim().min(1).max(300),
  planNameAr: z.string().trim().min(1).max(300),
  planNameEn: z.string().trim().min(1).max(300),
  mealPlanKey: z.string().trim().min(1).max(40),

  nights: z.coerce.number().int().min(1).max(30),
  rooms: z.coerce.number().int().min(1).max(10),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  sellPerNight: z.coerce.number().min(0).max(99_999_999),
  sellTotal: z.coerce.number().min(0).max(99_999_999),
  isRefundable: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()),
});

/** Saving an offer either extends an existing quotation or starts a new one. */
export const saveOfferSchema = z
  .object({
    quotationId: z.string().uuid().optional().or(z.literal("")),
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1).max(20),
    children: z.coerce.number().int().min(0).max(10),
    rooms: z.coerce.number().int().min(1).max(10),
    item: quotationItemSchema,
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: "search.validation.checkOutBeforeCheckIn",
    path: ["checkOut"],
  });

export type QuotationDetailsInput = z.infer<typeof quotationDetailsSchema>;
export type QuotationItemInput = z.infer<typeof quotationItemSchema>;
export type SaveOfferInput = z.infer<typeof saveOfferSchema>;
