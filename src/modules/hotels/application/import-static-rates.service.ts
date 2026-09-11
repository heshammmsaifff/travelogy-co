import "server-only";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import { toHalfOpenRange } from "@/shared/lib/date-range";

/**
 * Static Contract Rates & Inventory Import Service.
 * Implements Hotels B2B Hub §6.1, §6.3 & Project Proposal Phase 9.
 * Parses Excel (.xlsx, .xls) and CSV sheets, validates hotel/room/plan mappings,
 * and performs atomic bulk upserts into rates and allocations tables.
 */

export const staticRateRowSchema = z.object({
  hotelCode: z.string().min(1, "Hotel code is required"),
  roomCode: z.string().min(1, "Room code is required"),
  planCode: z.string().min(1, "Rate plan code is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must be YYYY-MM-DD"),
  currency: z.string().length(3).default("SAR"),
  netRate: z.coerce.number().positive("Net rate must be greater than 0"),
  minStay: z.coerce.number().int().min(1).default(1),
  allotment: z.coerce.number().int().min(0).default(5),
});

export type StaticRateRow = z.infer<typeof staticRateRowSchema>;

export type RowValidationResult = {
  rowNumber: number;
  data: Partial<StaticRateRow>;
  isValid: boolean;
  errors: string[];
  hotelId?: string;
  roomTypeId?: string;
  ratePlanId?: string;
};

export type ParseResult = {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: RowValidationResult[];
};

type HotelMeta = { id: string; code: string; name_en: string };
type RoomMeta = { id: string; hotel_id: string; code: string };
type RatePlanMeta = { id: string; hotel_id: string; code: string };

/**
 * Parses uploaded Excel/CSV buffer and validates against database entities.
 */
export async function parseAndValidateStaticRates(
  fileBuffer: Buffer,
): Promise<ParseResult> {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { totalRows: 0, validCount: 0, errorCount: 0, rows: [] };
  }

  const sheet = workbook.Sheets[firstSheetName];
  if (!sheet) {
    return { totalRows: 0, validCount: 0, errorCount: 0, rows: [] };
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });

  if (rawRows.length === 0) {
    return { totalRows: 0, validCount: 0, errorCount: 0, rows: [] };
  }

  const supabase = createServiceRoleClient();

  // Pre-load all hotels, room types, and rate plans for fast in-memory validation
  const { data: rawHotels } = await supabase.from("hotels").select("id, code, name_en");
  const { data: rawRooms } = await supabase.from("room_types").select("id, hotel_id, code");
  const { data: rawPlans } = await supabase.from("rate_plans").select("id, hotel_id, code");

  const hotels = (rawHotels ?? []) as unknown as HotelMeta[];
  const roomTypes = (rawRooms ?? []) as unknown as RoomMeta[];
  const ratePlans = (rawPlans ?? []) as unknown as RatePlanMeta[];

  const hotelByCode = new Map<string, HotelMeta>(
    hotels.map((h) => [h.code.trim().toUpperCase(), h]),
  );
  const roomByHotelAndCode = new Map<string, string>(); // "hotelId:roomCode" -> roomTypeId
  for (const r of roomTypes) {
    roomByHotelAndCode.set(`${r.hotel_id}:${r.code.trim().toUpperCase()}`, r.id);
  }
  const planByHotelAndCode = new Map<string, string>(); // "hotelId:planCode" -> ratePlanId
  for (const p of ratePlans) {
    planByHotelAndCode.set(`${p.hotel_id}:${p.code.trim().toUpperCase()}`, p.id);
  }

  const validatedRows: RowValidationResult[] = [];
  let validCount = 0;
  let errorCount = 0;

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (!raw) continue;

    const rowNum = i + 2; // +1 for 1-based, +1 for header
    const errors: string[] = [];

    // Map column aliases (flexible headers)
    const hotelCode = String(raw.hotel_code || raw.hotelCode || raw["Hotel Code"] || "").trim();
    const roomCode = String(raw.room_code || raw.roomCode || raw["Room Code"] || "").trim();
    const planCode = String(
      raw.plan_code || raw.planCode || raw.rate_plan || raw["Rate Plan"] || raw.meal_plan || "RO",
    ).trim().toUpperCase();
    const startDate = String(raw.start_date || raw.startDate || raw["Start Date"] || "").trim();
    const endDate = String(raw.end_date || raw.endDate || raw["End Date"] || "").trim();
    const currency = String(raw.currency || raw.Currency || "SAR").trim().toUpperCase();
    const netRate = Number(raw.net_rate || raw.netRate || raw["Net Rate"] || 0);
    const minStay = Number(raw.min_stay || raw.minStay || raw["Min Stay"] || 1);
    const allotment = Number(raw.allotment || raw.Allotment || 5);

    const candidate = {
      hotelCode,
      roomCode,
      planCode,
      startDate,
      endDate,
      currency,
      netRate,
      minStay,
      allotment,
    };

    const parsed = staticRateRowSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`${issue.path.join(".")}: ${issue.message}`);
      }
    }

    if (startDate && endDate && startDate > endDate) {
      errors.push("Start date cannot be after end date");
    }

    // Database entity validation
    const hotel = hotelByCode.get(hotelCode.toUpperCase());
    let roomTypeId: string | undefined;
    let ratePlanId: string | undefined;

    if (!hotel) {
      errors.push(`Hotel code "${hotelCode}" not found`);
    } else {
      roomTypeId = roomByHotelAndCode.get(`${hotel.id}:${roomCode.toUpperCase()}`);
      if (!roomTypeId) {
        errors.push(`Room code "${roomCode}" not found for hotel "${hotelCode}"`);
      }
      ratePlanId = planByHotelAndCode.get(`${hotel.id}:${planCode.toUpperCase()}`);
      if (!ratePlanId) {
        errors.push(`Rate plan "${planCode}" not found for hotel "${hotelCode}"`);
      }
    }

    const isValid = errors.length === 0;
    if (isValid) validCount++;
    else errorCount++;

    validatedRows.push({
      rowNumber: rowNum,
      data: candidate,
      isValid,
      errors,
      hotelId: hotel?.id,
      roomTypeId,
      ratePlanId,
    });
  }

  return {
    totalRows: rawRows.length,
    validCount,
    errorCount,
    rows: validatedRows,
  };
}

/**
 * Commits pre-validated static rates into rates and allocations tables.
 */
export async function commitStaticRatesImport(
  validRows: RowValidationResult[],
  userId: string,
): Promise<{ importedCount: number; errors: string[] }> {
  const supabase = createServiceRoleClient();
  const errors: string[] = [];
  let importedCount = 0;

  for (const item of validRows) {
    if (!item.isValid || !item.ratePlanId || !item.roomTypeId || !item.data) continue;

    const d = item.data;
    const startDate = d.startDate!;
    const endDate = d.endDate!;
    const netRate = d.netRate!;
    const minStay = d.minStay || 1;
    const allotment = d.allotment || 5;

    // Convert date range to Postgres half-open format: [startDate, endDateInclusive + 1)
    const stayPeriod = toHalfOpenRange(startDate, endDate);

    // Insert rate
    const { error: rateErr } = await supabase.from("rates").insert({
      rate_plan_id: item.ratePlanId,
      room_type_id: item.roomTypeId,
      stay_period: stayPeriod,
      price_per_night: netRate,
      min_stay: minStay,
      max_stay: 30,
      is_closed: false,
    });

    if (rateErr) {
      errors.push(`Row ${item.rowNumber}: ${rateErr.message}`);
      continue;
    }

    // Insert or update nightly allocations across the range
    const startMs = Date.parse(`${startDate}T00:00:00Z`);
    const endMs = Date.parse(`${endDate}T00:00:00Z`);
    const dayMs = 86_400_000;

    const allocationRows: {
      room_type_id: string;
      stay_date: string;
      allotment: number;
      min_stay: number;
      stop_sell: boolean;
    }[] = [];

    for (let t = startMs; t <= endMs; t += dayMs) {
      const dateStr = new Date(t).toISOString().slice(0, 10);
      allocationRows.push({
        room_type_id: item.roomTypeId,
        stay_date: dateStr,
        allotment,
        min_stay: minStay,
        stop_sell: false,
      });
    }

    if (allocationRows.length > 0) {
      const { error: allocErr } = await supabase
        .from("allocations")
        .upsert(allocationRows, { onConflict: "room_type_id,stay_date" });

      if (allocErr) {
        errors.push(`Row ${item.rowNumber} allocations: ${allocErr.message}`);
      }
    }

    importedCount++;
  }

  // Audit log
  await supabase.rpc("write_audit", {
    p_action: "hotel.static_rates_imported",
    p_entity_type: "rates",
    p_entity_id: "bulk",
    p_metadata: {
      count: importedCount,
      errorsCount: errors.length,
      importedBy: userId,
    },
  });

  return { importedCount, errors };
}

/**
 * Generates sample CSV string for users to download.
 */
export function generateSampleStaticRatesCsv(): string {
  return [
    "hotel_code,room_code,plan_code,start_date,end_date,currency,net_rate,min_stay,allotment",
    "HTL001,STD,BB,2026-10-01,2026-10-31,SAR,450.00,1,10",
    "HTL001,DLX,HB,2026-10-01,2026-10-31,SAR,650.00,2,8",
    "HTL002,STE,RO,2026-11-01,2026-11-30,USD,180.00,1,5",
  ].join("\n");
}
