import "server-only";

import { createClient } from "@/shared/lib/supabase/server";

/**
 * Report reads (CLAUDE.md §13, Phase 7).
 *
 * Every figure comes back already aggregated from Postgres (§11), and every
 * function behind these demands `reports.view` — which is what keeps margin
 * away from anyone who should not see it. Nothing on this side computes a
 * total; a margin recomputed in JavaScript would be a second answer to the
 * question the ledger already answers.
 */

export type ReportFilters = {
  from?: string;
  to?: string;
  status?: string;
  agencyId?: string;
  hotelId?: string;
};

export type BookingReportRow = {
  reference: string;
  bookedOn: string;
  status: string;
  agencyName: string | null;
  agencyCode: string | null;
  hotelName: string | null;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  roomNights: number;
  currencyCode: string;
  sellTotal: number;
  /** NULL for a booking made before cost capture existed — not zero. */
  netTotal: number | null;
  margin: number | null;
  marginPct: number | null;
};

export type AgentReportRow = {
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  bookingsTotal: number;
  bookingsLive: number;
  bookingsCancelled: number;
  cancellationPct: number;
  roomNights: number;
  currencyCode: string;
  sellTotal: number;
  netTotal: number;
  margin: number;
  marginPct: number;
  paidTotal: number;
  balance: number;
};

export type HotelReportRow = {
  hotelId: string;
  hotelCode: string;
  hotelName: string;
  city: string | null;
  bookingsLive: number;
  roomNights: number;
  currencyCode: string;
  sellTotal: number;
  netTotal: number;
  margin: number;
  marginPct: number;
};

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function getBookingReport(
  locale: "ar" | "en",
  filters: ReportFilters = {},
): Promise<BookingReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_bookings", {
    p_from: filters.from,
    p_to: filters.to,
    p_status: filters.status,
    p_agency_id: filters.agencyId,
    p_hotel_id: filters.hotelId,
  });

  // The function raises for a caller without `reports.view`, which arrives as
  // an error. The page shows nothing either way — the database decided.
  if (error || !data) return [];

  const ar = locale === "ar";
  return data.map((r) => ({
    reference: r.reference,
    bookedOn: r.booked_on,
    status: r.status,
    agencyName: r.agency_name,
    agencyCode: r.agency_code,
    hotelName: (ar ? r.hotel_name_ar : r.hotel_name_en) ?? null,
    guestName: r.guest_name,
    checkIn: r.check_in,
    checkOut: r.check_out,
    nights: r.nights,
    rooms: r.rooms,
    roomNights: r.room_nights,
    currencyCode: r.currency_code,
    sellTotal: Number(r.sell_total),
    netTotal: num(r.net_total),
    margin: num(r.margin),
    marginPct: num(r.margin_pct),
  }));
}

export async function getAgentReport(filters: ReportFilters = {}): Promise<AgentReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_agent_performance", {
    p_from: filters.from,
    p_to: filters.to,
  });
  if (error || !data) return [];

  return data.map((r) => ({
    agencyId: r.agency_id,
    agencyName: r.agency_name,
    agencyCode: r.agency_code,
    bookingsTotal: r.bookings_total,
    bookingsLive: r.bookings_live,
    bookingsCancelled: r.bookings_cancelled,
    cancellationPct: Number(r.cancellation_pct),
    roomNights: r.room_nights,
    currencyCode: r.currency_code,
    sellTotal: Number(r.sell_total),
    netTotal: Number(r.net_total),
    margin: Number(r.margin),
    marginPct: Number(r.margin_pct),
    paidTotal: Number(r.paid_total),
    balance: Number(r.balance),
  }));
}

export async function getHotelReport(
  locale: "ar" | "en",
  filters: ReportFilters = {},
): Promise<HotelReportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("report_hotel_performance", {
    p_from: filters.from,
    p_to: filters.to,
  });
  if (error || !data) return [];

  const ar = locale === "ar";
  return data.map((r) => ({
    hotelId: r.hotel_id,
    hotelCode: r.hotel_code,
    hotelName: ar ? r.hotel_name_ar : r.hotel_name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    bookingsLive: r.bookings_live,
    roomNights: r.room_nights,
    currencyCode: r.currency_code ?? "EGP",
    sellTotal: Number(r.sell_total),
    netTotal: Number(r.net_total),
    margin: Number(r.margin),
    marginPct: Number(r.margin_pct),
  }));
}
