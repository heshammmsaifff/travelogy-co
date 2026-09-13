import "server-only";
import * as XLSX from "xlsx";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import { describeDbError } from "@/shared/lib/db-error";
import { toHalfOpenRange } from "@/shared/lib/date-range";
import {
  MAX_STATIC_RATE_ROWS,
  candidateFromSheetRow,
  nightsInclusive,
  staticRateRowSchema,
  type StaticRateCandidate,
  type StaticRateRow,
} from "./static-rate-row";

/**
 * Static Contract Rates & Inventory Import (Hotels B2B Hub §6.1, §6.3; Phase 9c).
 *
 * Two steps, and the second does NOT trust the first. The preview validates
 * the sheet and shows the admin what will happen; the commit receives rows
 * back from the browser, so it validates them again from scratch — codes,
 * dates, currency and all. The first version accepted `isValid`, `roomTypeId`
 * and `ratePlanId` exactly as the browser sent them (§12).
 */

export type RowValidationResult = {
  rowNumber: number;
  data: StaticRateCandidate;
  isValid: boolean;
  errors: string[];
};

export type ParseResult = {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: RowValidationResult[];
};

/** A row as it comes back from the preview for committing. */
export type SubmittedRow = { rowNumber: number; data: unknown };

export class TooManyRowsError extends Error {
  constructor() {
    super(`A file may contain at most ${MAX_STATIC_RATE_ROWS} rows.`);
    this.name = "TooManyRowsError";
  }
}

type ResolvedRow = {
  rowNumber: number;
  row: StaticRateRow;
  roomTypeId: string;
  ratePlanId: string;
};

/** Reads the first sheet of a CSV or Excel file into candidate rows. */
export function readStaticRateSheet(fileBuffer: Buffer): { rowNumber: number; data: StaticRateCandidate }[] {
  const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : undefined;
  if (!sheet) return [];

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });

  if (rawRows.length > MAX_STATIC_RATE_ROWS) throw new TooManyRowsError();

  // +2: one for 1-based numbering, one for the header row, so the number
  // matches what the admin sees in their spreadsheet.
  return rawRows.map((raw, i) => ({ rowNumber: i + 2, data: candidateFromSheetRow(raw) }));
}

/**
 * Validates rows against the schema and the database.
 *
 * Loads only the hotels the file actually names, and their rooms and plans —
 * never the whole inventory (§11).
 */
async function validateRows(
  rows: SubmittedRow[],
): Promise<{ results: RowValidationResult[]; resolved: ResolvedRow[] }> {
  const shaped = rows.map((r) => ({
    rowNumber: r.rowNumber,
    data: r.data as StaticRateCandidate,
    parsed: staticRateRowSchema.safeParse(r.data),
  }));

  const hotelCodes = [
    ...new Set(shaped.flatMap((s) => (s.parsed.success ? [s.parsed.data.hotelCode] : []))),
  ];

  const supabase = createServiceRoleClient();

  const hotelByCode = new Map<string, string>();
  const roomByHotelAndCode = new Map<string, string>();
  const planByHotelAndCode = new Map<string, { id: string; currency: string }>();

  if (hotelCodes.length > 0) {
    const { data: hotels, error: hotelsError } = await supabase
      .from("hotels")
      .select("id, code")
      .in("code", hotelCodes);
    if (hotelsError) throw new Error(describeDbError(hotelsError));

    for (const h of hotels ?? []) hotelByCode.set(h.code.trim().toUpperCase(), h.id);

    const hotelIds = [...hotelByCode.values()];
    if (hotelIds.length > 0) {
      const [rooms, plans] = await Promise.all([
        supabase.from("room_types").select("id, hotel_id, code").in("hotel_id", hotelIds),
        supabase.from("rate_plans").select("id, hotel_id, code, currency_code").in("hotel_id", hotelIds),
      ]);
      if (rooms.error) throw new Error(describeDbError(rooms.error));
      if (plans.error) throw new Error(describeDbError(plans.error));

      for (const r of rooms.data ?? []) {
        roomByHotelAndCode.set(`${r.hotel_id}:${r.code.trim().toUpperCase()}`, r.id);
      }
      for (const p of plans.data ?? []) {
        planByHotelAndCode.set(`${p.hotel_id}:${p.code.trim().toUpperCase()}`, {
          id: p.id,
          currency: p.currency_code,
        });
      }
    }
  }

  const results: RowValidationResult[] = [];
  const resolved: ResolvedRow[] = [];

  for (const s of shaped) {
    if (!s.parsed.success) {
      results.push({
        rowNumber: s.rowNumber,
        data: s.data,
        isValid: false,
        errors: s.parsed.error.issues.map((issue) => issue.message),
      });
      continue;
    }

    const row = s.parsed.data;
    const errors: string[] = [];
    const hotelId = hotelByCode.get(row.hotelCode);
    let roomTypeId: string | undefined;
    let plan: { id: string; currency: string } | undefined;

    if (!hotelId) {
      errors.push(`Hotel code "${row.hotelCode}" not found`);
    } else {
      roomTypeId = roomByHotelAndCode.get(`${hotelId}:${row.roomCode}`);
      if (!roomTypeId) errors.push(`Room code "${row.roomCode}" not found for hotel "${row.hotelCode}"`);

      plan = planByHotelAndCode.get(`${hotelId}:${row.planCode}`);
      if (!plan) {
        errors.push(`Rate plan "${row.planCode}" not found for hotel "${row.hotelCode}"`);
      } else if (row.currency && row.currency !== plan.currency) {
        // Rates carry no currency of their own; they are priced in the plan's.
        errors.push(
          `Currency ${row.currency} does not match rate plan "${row.planCode}" (${plan.currency})`,
        );
      }
    }

    const isValid = errors.length === 0 && roomTypeId !== undefined && plan !== undefined;
    results.push({
      rowNumber: s.rowNumber,
      data: { ...s.data, currency: row.currency ?? plan?.currency ?? null },
      isValid,
      errors,
    });

    if (isValid) {
      resolved.push({ rowNumber: s.rowNumber, row, roomTypeId: roomTypeId!, ratePlanId: plan!.id });
    }
  }

  return { results, resolved };
}

/** Parses an uploaded file and validates every row, for the preview. */
export async function parseAndValidateStaticRates(fileBuffer: Buffer): Promise<ParseResult> {
  const rows = readStaticRateSheet(fileBuffer);
  const { results } = await validateRows(rows);
  const validCount = results.filter((r) => r.isValid).length;

  return {
    totalRows: results.length,
    validCount,
    errorCount: results.length - validCount,
    rows: results,
  };
}

function describeImportError(error: unknown): string {
  const message = describeDbError(error);
  if (/rates_no_overlapping_periods/.test(message)) {
    return "A rate already covers some of these nights for this room and plan.";
  }
  if (/allocations_not_oversold/.test(message)) {
    return "The allotment is below rooms already sold on some of these nights.";
  }
  return message;
}

/**
 * Re-validates submitted rows and imports the ones that pass.
 *
 * Each row is its own unit: a rate that overlaps an existing one is refused
 * by the database's exclusion constraint and reported, and the rest go in.
 */
export async function commitStaticRatesImport(
  rows: SubmittedRow[],
  userId: string,
): Promise<{ importedCount: number; errors: string[] }> {
  const { results, resolved } = await validateRows(rows);
  const supabase = createServiceRoleClient();

  const errors = results
    .filter((r) => !r.isValid)
    .map((r) => `Row ${r.rowNumber}: ${r.errors.join("; ")}`);
  let importedCount = 0;

  for (const item of resolved) {
    const { row } = item;

    const { error: rateErr } = await supabase.from("rates").insert({
      rate_plan_id: item.ratePlanId,
      room_type_id: item.roomTypeId,
      // First and LAST night as entered; stored half-open (§15, 6.3).
      stay_period: toHalfOpenRange(row.startDate, row.endDate),
      price_per_night: row.netRate,
      min_stay: row.minStay,
    });

    if (rateErr) {
      errors.push(`Row ${item.rowNumber}: ${describeImportError(rateErr)}`);
      continue;
    }

    // Only the allotment is written. Stop-sell flags and per-night min-stay
    // overrides an admin set by hand are left exactly as they were.
    const { error: allocErr } = await supabase.from("allocations").upsert(
      nightsInclusive(row.startDate, row.endDate).map((stayDate) => ({
        room_type_id: item.roomTypeId,
        stay_date: stayDate,
        allotment: row.allotment,
      })),
      { onConflict: "room_type_id,stay_date" },
    );

    if (allocErr) {
      errors.push(
        `Row ${item.rowNumber}: rate saved, but allocation was not — ${describeImportError(allocErr)}`,
      );
      continue;
    }

    importedCount++;
  }

  // Service-role writes carry no user, so the importer is named in the entry.
  const { error: auditErr } = await supabase.rpc("write_audit", {
    p_action: "hotel.static_rates_imported",
    p_entity_type: "rates",
    p_entity_id: "bulk",
    p_changes: {
      imported_by: userId,
      submitted: rows.length,
      imported: importedCount,
      errors: errors.length,
    },
  });
  if (auditErr) console.error("[static-rates] audit failed:", auditErr.message);

  return { importedCount, errors };
}
