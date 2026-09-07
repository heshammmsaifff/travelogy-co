import { z } from "zod";

/** Agent-facing availability search input (CLAUDE.md §13, Phase 3c). */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "hotels.validation.dateInvalid")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "hotels.validation.dateInvalid");

export const availabilitySearchSchema = z
  .object({
    checkIn: isoDate,
    checkOut: isoDate,
    adults: z.coerce.number().int().min(1).max(20).default(2),
    children: z.coerce.number().int().min(0).max(10).default(0),
    rooms: z.coerce.number().int().min(1).max(10).default(1),
    country: z.string().trim().length(2).toUpperCase().optional().or(z.literal("")),
    city: z.string().trim().max(120).optional().or(z.literal("")),
    q: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .refine((d) => d.checkOut > d.checkIn, {
    message: "search.validation.checkOutBeforeCheckIn",
    path: ["checkOut"],
  })
  .refine(
    (d) => {
      const nights =
        (Date.parse(`${d.checkOut}T00:00:00Z`) - Date.parse(`${d.checkIn}T00:00:00Z`)) / 86_400_000;
      return nights <= 30;
    },
    // Matches the ceiling enforced by search_availability(), so the user gets
    // a field message rather than a database exception.
    { message: "search.validation.stayTooLong", path: ["checkOut"] },
  );

export type AvailabilitySearchInput = z.infer<typeof availabilitySearchSchema>;
