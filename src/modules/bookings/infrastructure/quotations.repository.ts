import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Locale } from "@/shared/i18n/config";

/**
 * Quotation reads (CLAUDE.md §13, Phase 4).
 *
 * Every query runs through the caller's own session, so RLS decides what comes
 * back. None of these functions filter by agency in JavaScript — that would be
 * a second, weaker copy of a rule the database already enforces, and the two
 * would eventually disagree (§12).
 */

export type QuotationSummary = {
  id: string;
  reference: string;
  title: string | null;
  guestName: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  currencyCode: string;
  status: "draft" | "sent" | "accepted" | "expired";
  validUntil: string | null;
  createdAt: string;
  itemCount: number;
  total: number;
};

export type QuotationItem = {
  id: string;
  supplierKey: string;
  hotelName: string;
  city: string | null;
  countryCode: string | null;
  starRating: number | null;
  coverUrl: string | null;
  roomName: string;
  planName: string;
  mealPlanKey: string;
  nights: number;
  rooms: number;
  currencyCode: string;
  sellPerNight: number;
  sellTotal: number;
  isRefundable: boolean;
  capturedAt: string;
};

export type QuotationDetail = Omit<QuotationSummary, "itemCount" | "total"> & {
  notes: string | null;
  items: QuotationItem[];
  total: number;
};

const ITEM_COLUMNS =
  "id, supplier_key, hotel_name_ar, hotel_name_en, city_ar, city_en, country_code, star_rating, cover_url, room_name_ar, room_name_en, plan_name_ar, plan_name_en, meal_plan_key, nights, rooms, currency_code, sell_per_night, sell_total, is_refundable, captured_at, sort_order";

type ItemRow = {
  id: string;
  supplier_key: string;
  hotel_name_ar: string;
  hotel_name_en: string;
  city_ar: string | null;
  city_en: string | null;
  country_code: string | null;
  star_rating: number | null;
  cover_url: string | null;
  room_name_ar: string;
  room_name_en: string;
  plan_name_ar: string;
  plan_name_en: string;
  meal_plan_key: string;
  nights: number;
  rooms: number;
  currency_code: string;
  sell_per_night: number;
  sell_total: number;
  is_refundable: boolean;
  captured_at: string;
};

function toItem(row: ItemRow, locale: Locale): QuotationItem {
  const ar = locale === "ar";
  return {
    id: row.id,
    supplierKey: row.supplier_key,
    hotelName: ar ? row.hotel_name_ar : row.hotel_name_en,
    city: (ar ? row.city_ar : row.city_en) ?? null,
    countryCode: row.country_code,
    starRating: row.star_rating,
    coverUrl: row.cover_url,
    roomName: ar ? row.room_name_ar : row.room_name_en,
    planName: ar ? row.plan_name_ar : row.plan_name_en,
    mealPlanKey: row.meal_plan_key,
    nights: row.nights,
    rooms: row.rooms,
    currencyCode: row.currency_code,
    sellPerNight: Number(row.sell_per_night),
    sellTotal: Number(row.sell_total),
    isRefundable: row.is_refundable,
    capturedAt: row.captured_at,
  };
}

export async function listQuotations(): Promise<QuotationSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select(
      "id, reference, title, guest_name, check_in, check_out, adults, children, rooms, currency_code, status, valid_until, created_at, quotation_items (sell_total)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data.map((q) => {
    const items = (q.quotation_items ?? []) as { sell_total: number }[];
    return {
      id: q.id,
      reference: q.reference,
      title: q.title,
      guestName: q.guest_name,
      checkIn: q.check_in,
      checkOut: q.check_out,
      adults: q.adults,
      children: q.children,
      rooms: q.rooms,
      currencyCode: q.currency_code,
      status: q.status,
      validUntil: q.valid_until,
      createdAt: q.created_at,
      itemCount: items.length,
      // The quotation total is the sum of its options. Computed here rather
      // than stored, so it cannot drift from the rows it describes.
      total: items.reduce((sum, item) => sum + Number(item.sell_total), 0),
    };
  });
}

/** The shortlist the "save to quotation" dialog offers — open quotes only. */
export async function listOpenQuotations(): Promise<
  { id: string; reference: string; title: string | null }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select("id, reference, title")
    .in("status", ["draft", "sent"])
    .order("created_at", { ascending: false })
    .limit(25);

  return error || !data ? [] : data;
}

export async function getQuotation(id: string, locale: Locale): Promise<QuotationDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quotations")
    .select(
      `id, reference, title, guest_name, check_in, check_out, adults, children, rooms, currency_code, status, valid_until, notes, created_at, quotation_items (${ITEM_COLUMNS})`,
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const rows = ((data.quotation_items ?? []) as ItemRow[])
    .slice()
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  const items = rows.map((row) => toItem(row, locale));

  return {
    id: data.id,
    reference: data.reference,
    title: data.title,
    guestName: data.guest_name,
    checkIn: data.check_in,
    checkOut: data.check_out,
    adults: data.adults,
    children: data.children,
    rooms: data.rooms,
    currencyCode: data.currency_code,
    status: data.status,
    validUntil: data.valid_until,
    notes: data.notes,
    createdAt: data.created_at,
    items,
    total: items.reduce((sum, item) => sum + item.sellTotal, 0),
  };
}
