import { z } from "zod";

/**
 * One row of a static rate contract upload (CSV / Excel), before it is checked
 * against the database.
 *
 * Kept free of `server-only` and Supabase so the parsing rules — the part most
 * likely to be wrong in a way nobody notices — can be unit-tested directly.
 *
 * The rules that matter, each of which the first version got wrong:
 *   - an allotment of 0 is a stop-sell, not "blank": `raw.allotment || 5`
 *     turned every 0 into 5 rooms nobody contracted;
 *   - a missing allotment or rate plan is an ERROR, never a default. Guessing
 *     "5 rooms" or "RO" invents inventory and a meal plan (§2.6 by analogy);
 *   - the currency must match the rate plan's own currency. A USD figure
 *     silently stored into an SAR plan is a price wrong by a factor of 3.75.
 *     That check needs the plan, so it happens in the service; here the
 *     currency is only shape-checked, and may be left blank to mean "the
 *     plan's currency".
 */

export const MAX_STATIC_RATE_ROWS = 2000;
export const MAX_STATIC_RATE_FILE_BYTES = 5 * 1024 * 1024;
/** Longest period one row may cover; each night becomes an allocation row. */
export const MAX_STATIC_RATE_NIGHTS = 366;

const DAY_MS = 86_400_000;

function isoDate(label: string) {
  return z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`)
    .refine((s) => {
      const d = new Date(`${s}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
    }, `${label} is not a real calendar date`);
}

export const staticRateRowSchema = z
  .object({
    hotelCode: z.string().trim().min(1, "Hotel code is required"),
    roomCode: z.string().trim().min(1, "Room code is required"),
    planCode: z.string().trim().min(1, "Rate plan code is required"),
    startDate: isoDate("Start date"),
    endDate: isoDate("End date"),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter code")
      .nullable(),
    netRate: z
      .number({ error: "Net rate must be a number" })
      .finite("Net rate must be a number")
      .positive("Net rate must be greater than 0"),
    minStay: z
      .number({ error: "Min stay must be a whole number" })
      .int("Min stay must be a whole number")
      .min(1, "Min stay must be at least 1")
      .max(30, "Min stay cannot exceed 30"),
    allotment: z
      .number({ error: "Allotment is required (0 means stop-sell)" })
      .int("Allotment must be a whole number")
      .min(0, "Allotment cannot be negative"),
  })
  .refine((r) => r.endDate >= r.startDate, {
    message: "Start date cannot be after end date",
    path: ["endDate"],
  })
  .refine(
    (r) =>
      (Date.parse(`${r.endDate}T00:00:00Z`) - Date.parse(`${r.startDate}T00:00:00Z`)) / DAY_MS <
      MAX_STATIC_RATE_NIGHTS,
    { message: `One row may cover at most ${MAX_STATIC_RATE_NIGHTS} nights`, path: ["endDate"] },
  );

/** What a sheet row becomes before validation. Numbers may be NaN. */
export type StaticRateCandidate = {
  hotelCode: string;
  roomCode: string;
  planCode: string;
  startDate: string;
  endDate: string;
  currency: string | null;
  netRate: number;
  minStay: number;
  allotment: number;
};

export type StaticRateRow = z.output<typeof staticRateRowSchema>;

/** The first header alias present with a non-blank value. */
function pick(raw: Record<string, unknown>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = raw[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

/** Blank is NaN (so it fails validation), never 0. */
function toNumber(value: string): number {
  return value === "" ? Number.NaN : Number(value.replace(/,/g, ""));
}

/** Maps a sheet row (header -> cell) onto a candidate, accepting common header spellings. */
export function candidateFromSheetRow(raw: Record<string, unknown>): StaticRateCandidate {
  const minStay = pick(raw, ["min_stay", "minStay", "Min Stay"]);
  const currency = pick(raw, ["currency", "Currency"]);

  return {
    hotelCode: pick(raw, ["hotel_code", "hotelCode", "Hotel Code"]).toUpperCase(),
    roomCode: pick(raw, ["room_code", "roomCode", "Room Code"]).toUpperCase(),
    planCode: pick(raw, ["plan_code", "planCode", "rate_plan", "Rate Plan"]).toUpperCase(),
    startDate: pick(raw, ["start_date", "startDate", "Start Date"]),
    endDate: pick(raw, ["end_date", "endDate", "End Date"]),
    currency: currency === "" ? null : currency.toUpperCase(),
    netRate: toNumber(pick(raw, ["net_rate", "netRate", "Net Rate"])),
    // Min stay is the one genuine default: the rates table itself defaults it to 1.
    minStay: minStay === "" ? 1 : toNumber(minStay),
    allotment: toNumber(pick(raw, ["allotment", "Allotment"])),
  };
}

/** Every night from the first to the last, inclusive, as ISO dates. */
export function nightsInclusive(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let t = Date.parse(`${startDate}T00:00:00Z`); t <= end; t += DAY_MS) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}
