import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/shared/i18n/config";
import { requirePermission } from "@/modules/auth/infrastructure/guard";
import {
  getAgentReport,
  getBookingReport,
  getHotelReport,
} from "@/modules/reports/infrastructure/reports.repository";

/**
 * CSV export (CLAUDE.md §13, Phase 7).
 *
 * Two details do the real work here:
 *
 *  1. **The UTF-8 byte-order mark.** Excel on Windows opens a UTF-8 CSV as
 *     ANSI unless the file starts with a BOM, which turns every Arabic name
 *     into mojibake. The report would be technically correct and practically
 *     useless. One three-byte prefix is the whole fix.
 *
 *  2. **`reports.export` is a SEPARATE permission from `reports.view`.** Reading
 *     a margin on screen and walking out with the whole book of business in a
 *     spreadsheet are different acts, and §7's registry already names both.
 *     The database functions still re-check `reports.view` underneath.
 */

const REPORTS = ["bookings", "agents", "hotels"] as const;
type ReportKind = (typeof REPORTS)[number];

/** RFC 4180: quote everything, double any internal quote. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // CRLF, because that is what the format says and what Excel expects.
  return lines.join("\r\n");
}

export async function GET(request: NextRequest) {
  try {
    await requirePermission("reports.export");
  } catch {
    // No body: an export endpoint should not describe what it is protecting.
    return new NextResponse(null, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const kind = searchParams.get("report") as ReportKind | null;
  if (!kind || !REPORTS.includes(kind)) {
    return new NextResponse(null, { status: 400 });
  }

  const localeParam = searchParams.get("locale") ?? "ar";
  const locale = isLocale(localeParam) ? localeParam : "ar";
  const filters = {
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    status: searchParams.get("status") ?? undefined,
  };

  let header: string[];
  let rows: (string | number | null)[][];

  if (kind === "bookings") {
    const data = await getBookingReport(locale, filters);
    header = [
      "reference", "booked_on", "status", "agency", "agency_code", "hotel", "guest",
      "check_in", "check_out", "nights", "rooms", "room_nights",
      "currency", "sell_total", "net_total", "margin", "margin_pct",
    ];
    rows = data.map((r) => [
      r.reference, r.bookedOn, r.status, r.agencyName, r.agencyCode, r.hotelName, r.guestName,
      r.checkIn, r.checkOut, r.nights, r.rooms, r.roomNights,
      r.currencyCode, r.sellTotal, r.netTotal, r.margin, r.marginPct,
    ]);
  } else if (kind === "agents") {
    const data = await getAgentReport(filters);
    header = [
      "agency", "agency_code", "bookings_total", "bookings_live", "bookings_cancelled",
      "cancellation_pct", "room_nights", "currency",
      "sell_total", "net_total", "margin", "margin_pct", "paid_total", "balance",
    ];
    rows = data.map((r) => [
      r.agencyName, r.agencyCode, r.bookingsTotal, r.bookingsLive, r.bookingsCancelled,
      r.cancellationPct, r.roomNights, r.currencyCode,
      r.sellTotal, r.netTotal, r.margin, r.marginPct, r.paidTotal, r.balance,
    ]);
  } else {
    const data = await getHotelReport(locale, filters);
    header = [
      "hotel_code", "hotel", "city", "bookings_live", "room_nights",
      "currency", "sell_total", "net_total", "margin", "margin_pct",
    ];
    rows = data.map((r) => [
      r.hotelCode, r.hotelName, r.city, r.bookingsLive, r.roomNights,
      r.currencyCode, r.sellTotal, r.netTotal, r.margin, r.marginPct,
    ]);
  }

  const csv = toCsv(header, rows);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="last-line-${kind}-${stamp}.csv"`,
      // A margin report must never sit in a shared cache.
      "cache-control": "no-store, private",
    },
  });
}
