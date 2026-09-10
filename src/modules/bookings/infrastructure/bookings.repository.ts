import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type { Locale } from "@/shared/i18n/config";

/**
 * Booking reads (CLAUDE.md §13, Phase 5a).
 *
 * Scoping is left entirely to RLS: an agent sees their own agency's rows,
 * back-office staff holding `bookings.view_all` see everything, and neither
 * case is filtered in JavaScript. A second copy of an access rule is a second
 * chance to get it wrong (§12).
 */

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed";

/**
 * What was bought. A transfer is a row in this same table, not a second
 * booking table (§15, Phase 8a) — so every read here has to say which it is
 * rather than assuming a hotel.
 */
export type ProductType = "hotel" | "transfer" | "package";

export type BookingSummary = {
  id: string;
  reference: string;
  productType: ProductType;
  status: BookingStatus;
  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;
  leadGuestName: string;
  currencyCode: string;
  totalSell: number;
  createdAt: string;
  hotelName: string | null;
  /**
   * What the booking is *for*, whichever product it is: the hotel's name, or
   * the transfer's route. One column in a list has to name both.
   */
  title: string | null;
  agencyName: string | null;
  agencyCode: string | null;
};

export type BookingDetail = BookingSummary & {
  subtotalSell: number;
  discountAmount: number;
  promoCode: string | null;
  taxRatePercent: number;
  taxAmount: number;
  adults: number;
  children: number;
  leadGuestEmail: string | null;
  leadGuestPhone: string | null;
  specialRequests: string | null;
  cancellationReason: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  items: {
    id: string;
    supplierKey: string;
    hotelName: string;
    city: string | null;
    countryCode: string | null;
    starRating: number | null;
    roomName: string;
    planName: string;
    mealPlanKey: string;
    nights: number;
    rooms: number;
    currencyCode: string;
    sellPerNight: number;
    sellTotal: number;
    isRefundable: boolean;
  }[];
  /** Present on a package booking; empty otherwise. One row per occupancy. */
  packageItems: {
    id: string;
    packageCode: string;
    name: string;
    city: string | null;
    countryCode: string | null;
    durationNights: number;
    departureDate: string;
    returnDate: string;
    occupancy: "single" | "double" | "triple" | "child";
    travellers: number;
    currencyCode: string;
    sellPerPerson: number;
    sellTotal: number;
  }[];
  /** Present on a transfer booking; empty on a hotel one. */
  transferItems: {
    id: string;
    routeCode: string;
    fromName: string;
    toName: string;
    city: string | null;
    direction: "arrival" | "departure" | "point_to_point";
    vehicleName: string;
    maxPassengers: number;
    transferDate: string;
    pickupTime: string | null;
    flightNumber: string | null;
    pickupNotes: string | null;
    passengers: number;
    vehicles: number;
    currencyCode: string;
    sellPerVehicle: number;
    sellTotal: number;
  }[];
};

type ListRow = {
  id: string;
  reference: string;
  product_type: ProductType;
  status: BookingStatus;
  check_in: string;
  check_out: string;
  nights: number;
  rooms: number;
  lead_guest_name: string;
  currency_code: string;
  total_sell: number;
  created_at: string;
  agency_name: string | null;
  agency_code: string | null;
  booking_items: { hotel_name_ar: string; hotel_name_en: string }[] | null;
  transfer_items:
    | { from_name_ar: string; from_name_en: string; to_name_ar: string; to_name_en: string }[]
    | null;
  package_items: { name_ar: string; name_en: string }[] | null;
};

function toSummary(row: ListRow, locale: Locale): BookingSummary {
  const ar = locale === "ar";
  const first = row.booking_items?.[0];
  const leg = row.transfer_items?.[0];
  const tour = row.package_items?.[0];
  const hotelName = first ? (ar ? first.hotel_name_ar : first.hotel_name_en) : null;
  // Arabic reads right to left, so the arrow between two place names points
  // that way too — a "→" in an RTL line puts the destination on the wrong side.
  const routeName = leg
    ? ar
      ? `${leg.from_name_ar} ← ${leg.to_name_ar}`
      : `${leg.from_name_en} → ${leg.to_name_en}`
    : null;

  const tourName = tour ? (ar ? tour.name_ar : tour.name_en) : null;

  return {
    id: row.id,
    reference: row.reference,
    productType: row.product_type,
    status: row.status,
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    rooms: row.rooms,
    leadGuestName: row.lead_guest_name,
    currencyCode: row.currency_code,
    totalSell: Number(row.total_sell),
    createdAt: row.created_at,
    hotelName,
    title: hotelName ?? routeName ?? tourName,
    agencyName: row.agency_name,
    agencyCode: row.agency_code,
  };
}

export async function listBookings(
  locale: Locale,
  filters: { status?: string } = {},
): Promise<BookingSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, reference, product_type, status, check_in, check_out, nights, rooms, lead_guest_name, currency_code, total_sell, created_at, agency_name, agency_code, booking_items (hotel_name_ar, hotel_name_en), transfer_items (from_name_ar, from_name_en, to_name_ar, to_name_en), package_items (name_ar, name_en)",
    )
    .order("created_at", { ascending: false })
    // §11: never load an unbounded table. Paging arrives with the reports work.
    .limit(100);

  const STATUSES = ["pending", "confirmed", "cancelled", "completed"] as const;
  // Narrowed against the known set rather than passed through: the value comes
  // from a query string, and an unknown one should mean "no filter", not an error.
  const wanted = STATUSES.find((s) => s === filters.status);
  if (wanted) query = query.eq("status", wanted);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as unknown as ListRow[]).map((row) => toSummary(row, locale));
}

export async function getBooking(id: string, locale: Locale): Promise<BookingDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, reference, product_type, status, check_in, check_out, nights, rooms, adults, children, lead_guest_name, lead_guest_email, lead_guest_phone, special_requests, currency_code, total_sell, created_at, confirmed_at, cancelled_at, completed_at, cancellation_reason, agency_name, agency_code, subtotal_sell, discount_amount, promo_code, tax_rate_percent, tax_amount, booking_items (id, supplier_key, hotel_name_ar, hotel_name_en, city_ar, city_en, country_code, star_rating, room_name_ar, room_name_en, plan_name_ar, plan_name_en, meal_plan_key, nights, rooms, currency_code, sell_per_night, sell_total, is_refundable), transfer_items (id, route_code, from_name_ar, from_name_en, to_name_ar, to_name_en, city_ar, city_en, direction, vehicle_name_ar, vehicle_name_en, max_passengers, transfer_date, pickup_time, flight_number, pickup_notes, passengers, vehicles, currency_code, sell_per_vehicle, sell_total), package_items (id, package_code, name_ar, name_en, city_ar, city_en, country_code, duration_nights, departure_date, return_date, occupancy, travellers, currency_code, sell_per_person, sell_total)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  const ar = locale === "ar";
  const rows = (data.booking_items ?? []) as {
    id: string;
    supplier_key: string;
    hotel_name_ar: string;
    hotel_name_en: string;
    city_ar: string | null;
    city_en: string | null;
    country_code: string | null;
    star_rating: number | null;
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
  }[];

  const items = rows.map((r) => ({
    id: r.id,
    supplierKey: r.supplier_key,
    hotelName: ar ? r.hotel_name_ar : r.hotel_name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    countryCode: r.country_code,
    starRating: r.star_rating,
    roomName: ar ? r.room_name_ar : r.room_name_en,
    planName: ar ? r.plan_name_ar : r.plan_name_en,
    mealPlanKey: r.meal_plan_key,
    nights: r.nights,
    rooms: r.rooms,
    currencyCode: r.currency_code,
    sellPerNight: Number(r.sell_per_night),
    sellTotal: Number(r.sell_total),
    isRefundable: r.is_refundable,
  }));

  const transferRows = (data.transfer_items ?? []) as {
    id: string;
    route_code: string;
    from_name_ar: string;
    from_name_en: string;
    to_name_ar: string;
    to_name_en: string;
    city_ar: string | null;
    city_en: string | null;
    direction: "arrival" | "departure" | "point_to_point";
    vehicle_name_ar: string;
    vehicle_name_en: string;
    max_passengers: number;
    transfer_date: string;
    pickup_time: string | null;
    flight_number: string | null;
    pickup_notes: string | null;
    passengers: number;
    vehicles: number;
    currency_code: string;
    sell_per_vehicle: number;
    sell_total: number;
  }[];

  const transferItems = transferRows.map((r) => ({
    id: r.id,
    routeCode: r.route_code,
    fromName: ar ? r.from_name_ar : r.from_name_en,
    toName: ar ? r.to_name_ar : r.to_name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    direction: r.direction,
    vehicleName: ar ? r.vehicle_name_ar : r.vehicle_name_en,
    maxPassengers: r.max_passengers,
    transferDate: r.transfer_date,
    pickupTime: r.pickup_time,
    flightNumber: r.flight_number,
    pickupNotes: r.pickup_notes,
    passengers: r.passengers,
    vehicles: r.vehicles,
    currencyCode: r.currency_code,
    sellPerVehicle: Number(r.sell_per_vehicle),
    sellTotal: Number(r.sell_total),
  }));

  const firstLeg = transferItems[0];

  const packageRows = (data.package_items ?? []) as {
    id: string;
    package_code: string;
    name_ar: string;
    name_en: string;
    city_ar: string | null;
    city_en: string | null;
    country_code: string | null;
    duration_nights: number;
    departure_date: string;
    return_date: string;
    occupancy: "single" | "double" | "triple" | "child";
    travellers: number;
    currency_code: string;
    sell_per_person: number;
    sell_total: number;
  }[];

  const packageItems = packageRows.map((r) => ({
    id: r.id,
    packageCode: r.package_code,
    name: ar ? r.name_ar : r.name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    countryCode: r.country_code,
    durationNights: r.duration_nights,
    departureDate: r.departure_date,
    returnDate: r.return_date,
    occupancy: r.occupancy,
    travellers: r.travellers,
    currencyCode: r.currency_code,
    sellPerPerson: Number(r.sell_per_person),
    sellTotal: Number(r.sell_total),
  }));

  return {
    id: data.id,
    reference: data.reference,
    productType: data.product_type as ProductType,
    status: data.status,
    checkIn: data.check_in,
    checkOut: data.check_out,
    nights: data.nights,
    rooms: data.rooms,
    adults: data.adults,
    children: data.children,
    leadGuestName: data.lead_guest_name,
    leadGuestEmail: data.lead_guest_email,
    leadGuestPhone: data.lead_guest_phone,
    specialRequests: data.special_requests,
    currencyCode: data.currency_code,
    subtotalSell: Number(data.subtotal_sell),
    discountAmount: Number(data.discount_amount),
    promoCode: data.promo_code,
    taxRatePercent: Number(data.tax_rate_percent),
    taxAmount: Number(data.tax_amount),
    totalSell: Number(data.total_sell),
    createdAt: data.created_at,
    confirmedAt: data.confirmed_at,
    cancelledAt: data.cancelled_at,
    completedAt: data.completed_at,
    cancellationReason: data.cancellation_reason,
    hotelName: items[0]?.hotelName ?? null,
    title:
      items[0]?.hotelName ??
      (firstLeg
        ? ar
          ? `${firstLeg.fromName} ← ${firstLeg.toName}`
          : `${firstLeg.fromName} → ${firstLeg.toName}`
        : (packageItems[0]?.name ?? null)),
    agencyName: data.agency_name,
    agencyCode: data.agency_code,
    items,
    transferItems,
    packageItems,
  };
}

/** The agent's own credit position, computed by the database (§10). */
export async function getCreditSummary(): Promise<{
  creditLimit: number;
  outstanding: number;
  available: number;
  currencyCode: string;
} | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_credit_summary");
  const row = data?.[0];
  if (error || !row) return null;
  return {
    creditLimit: Number(row.credit_limit),
    outstanding: Number(row.outstanding),
    available: Number(row.available),
    currencyCode: row.currency_code,
  };
}
