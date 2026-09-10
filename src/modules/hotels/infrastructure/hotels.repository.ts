import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import { parseDateRange } from "@/shared/lib/date-range";
import type { HotelListFilters } from "@/modules/hotels/application/schemas";

/**
 * Hotel read models.
 *
 * Every query runs on the caller's session so RLS decides visibility, columns
 * are listed explicitly, and lists are bounded (CLAUDE.md §11, §12).
 */

export const HOTELS_PAGE_SIZE = 20;

export type HotelListRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  cityAr: string;
  cityEn: string;
  countryCode: string;
  propertyType: string;
  starRating: number | null;
  status: string;
  roomTypeCount: number;
  createdAt: string;
  coverUrl: string | null;
};

export async function listHotels(filters: HotelListFilters) {
  const supabase = await createClient();
  const from = (filters.page - 1) * HOTELS_PAGE_SIZE;

  let query = supabase.from("hotels").select(
    `id, code, name_ar, name_en, city_ar, city_en, country_code, property_type,
       star_rating, status, created_at,
       room_types(count),
       hotel_images(secure_url)`,
    { count: "exact" },
  );

  if (filters.status) query = query.eq("status", filters.status);

  if (filters.q) {
    // Strip PostgREST's `or` delimiters so a comma or paren cannot break out
    // of the filter expression.
    const term = filters.q.replace(/[,()]/g, " ").trim();
    if (term) {
      query = query.or(
        `name_en.ilike.%${term}%,name_ar.ilike.%${term}%,code.ilike.%${term}%,city_en.ilike.%${term}%,city_ar.ilike.%${term}%`,
      );
    }
  }

  const { data, count } = await query
    .order("created_at", { ascending: false })
    .range(from, from + HOTELS_PAGE_SIZE - 1);

  return {
    rows: (data ?? []).map((h) => ({
      id: h.id,
      code: h.code,
      nameAr: h.name_ar,
      nameEn: h.name_en,
      cityAr: h.city_ar,
      cityEn: h.city_en,
      countryCode: h.country_code,
      propertyType: h.property_type,
      starRating: h.star_rating,
      status: h.status,
      roomTypeCount: h.room_types?.[0]?.count ?? 0,
      createdAt: h.created_at,
      coverUrl: h.hotel_images?.[0]?.secure_url ?? null,
    })) satisfies HotelListRow[],
    total: count ?? 0,
    pageSize: HOTELS_PAGE_SIZE,
  };
}

/** Counts per status for the filter chips — grouped in Postgres, not in JS. */
export async function countHotelsByStatus(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase.from("hotel_status_counts").select("status, count");

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    if (row.status) counts[row.status] = Number(row.count ?? 0);
  }
  return counts;
}

export async function getHotel(id: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from("hotels")
    .select(
      `id, code, name_ar, name_en, description_ar, description_en, property_type, star_rating,
       country_code, city_ar, city_en, area_ar, area_en, address_ar, address_en,
       latitude, longitude, location_url, phone, email, website, check_in_time, check_out_time,
       status, internal_notes, created_at,
       hotel_amenities(amenity_key)`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    code: data.code,
    nameAr: data.name_ar,
    nameEn: data.name_en,
    descriptionAr: data.description_ar,
    descriptionEn: data.description_en,
    propertyType: data.property_type,
    starRating: data.star_rating,
    countryCode: data.country_code,
    cityAr: data.city_ar,
    cityEn: data.city_en,
    areaAr: data.area_ar,
    areaEn: data.area_en,
    addressAr: data.address_ar,
    addressEn: data.address_en,
    latitude: data.latitude,
    longitude: data.longitude,
    locationUrl: data.location_url,
    phone: data.phone,
    email: data.email,
    website: data.website,
    checkInTime: (data.check_in_time ?? "14:00:00").slice(0, 5),
    checkOutTime: (data.check_out_time ?? "12:00:00").slice(0, 5),
    status: data.status,
    internalNotes: data.internal_notes,
    createdAt: data.created_at,
    amenityKeys: (data.hotel_amenities ?? []).map((a) => a.amenity_key),
  };
}

export async function listAmenities() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("amenities")
    .select("key, category, name_ar, name_en, icon, sort_order")
    .order("category")
    .order("sort_order");

  const grouped = new Map<
    string,
    { key: string; nameAr: string; nameEn: string; icon: string | null }[]
  >();
  for (const a of data ?? []) {
    const row = { key: a.key, nameAr: a.name_ar, nameEn: a.name_en, icon: a.icon };
    const bucket = grouped.get(a.category);
    if (bucket) bucket.push(row);
    else grouped.set(a.category, [row]);
  }
  return grouped;
}

export async function listMealPlans() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("meal_plans")
    .select("key, name_ar, name_en")
    .order("sort_order");
  return (data ?? []).map((m) => ({ key: m.key, nameAr: m.name_ar, nameEn: m.name_en }));
}

// --------------------------------------------------------------- room types

export type RoomTypeRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  standardOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  sizeSqm: number | null;
  bedConfigurationAr: string | null;
  bedConfigurationEn: string | null;
  totalRooms: number;
  status: string;
};

export async function listRoomTypes(hotelId: string): Promise<RoomTypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("room_types")
    .select(
      `id, code, name_ar, name_en, description_ar, description_en, standard_occupancy,
       max_adults, max_children, max_occupancy, size_sqm, bed_configuration_ar,
       bed_configuration_en, total_rooms, status`,
    )
    .eq("hotel_id", hotelId)
    .order("sort_order")
    .order("code");

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    descriptionAr: r.description_ar,
    descriptionEn: r.description_en,
    standardOccupancy: r.standard_occupancy,
    maxAdults: r.max_adults,
    maxChildren: r.max_children,
    maxOccupancy: r.max_occupancy,
    sizeSqm: r.size_sqm,
    bedConfigurationAr: r.bed_configuration_ar,
    bedConfigurationEn: r.bed_configuration_en,
    totalRooms: r.total_rooms,
    status: r.status,
  }));
}

// -------------------------------------------------------------------- media

export async function listHotelImages(hotelId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hotel_images")
    .select(
      "id, room_type_id, cloudinary_public_id, secure_url, alt_ar, alt_en, is_cover, sort_order, bytes",
    )
    .eq("hotel_id", hotelId)
    .order("is_cover", { ascending: false })
    .order("sort_order");

  return (data ?? []).map((i) => ({
    id: i.id,
    roomTypeId: i.room_type_id,
    publicId: i.cloudinary_public_id,
    secureUrl: i.secure_url,
    altAr: i.alt_ar,
    altEn: i.alt_en,
    isCover: i.is_cover,
    sortOrder: i.sort_order,
    bytes: i.bytes,
  }));
}

// --------------------------------------------------------- rates & policies

export async function listRatePlans(hotelId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rate_plans")
    .select(
      `id, code, name_ar, name_en, meal_plan_key, currency_code, valid_from, valid_to, status,
       cancellation_policy_id,
       meal_plans!inner(name_ar, name_en),
       rates(count)`,
    )
    .eq("hotel_id", hotelId)
    .order("code");

  return (data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    nameAr: p.name_ar,
    nameEn: p.name_en,
    mealPlanKey: p.meal_plan_key,
    mealPlanNameAr: p.meal_plans.name_ar,
    mealPlanNameEn: p.meal_plans.name_en,
    currencyCode: p.currency_code,
    validFrom: p.valid_from,
    validTo: p.valid_to,
    status: p.status,
    cancellationPolicyId: p.cancellation_policy_id,
    rateCount: p.rates?.[0]?.count ?? 0,
  }));
}

/**
 * Rates for one plan.
 *
 * `stay_period` comes back as the half-open text form Postgres stores
 * (`[2026-06-01,2026-07-01)`). It is converted to the inclusive last night an
 * admin entered, so the screen shows back exactly what was typed.
 */
export async function listRates(ratePlanId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rates")
    .select(
      `id, room_type_id, stay_period, price_per_night, extra_adult_price, extra_child_price,
       single_occupancy_price, min_stay, max_stay, is_closed,
       room_types!inner(code, name_ar, name_en)`,
    )
    .eq("rate_plan_id", ratePlanId)
    .order("stay_period");

  return (data ?? []).map((r) => {
    const { from, to } = parseDateRange(r.stay_period as unknown as string);
    return {
      id: r.id,
      roomTypeId: r.room_type_id,
      roomCode: r.room_types.code,
      roomNameAr: r.room_types.name_ar,
      roomNameEn: r.room_types.name_en,
      dateFrom: from,
      dateTo: to,
      pricePerNight: Number(r.price_per_night),
      extraAdultPrice: Number(r.extra_adult_price),
      extraChildPrice: Number(r.extra_child_price),
      singleOccupancyPrice:
        r.single_occupancy_price == null ? null : Number(r.single_occupancy_price),
      minStay: r.min_stay,
      maxStay: r.max_stay,
      isClosed: r.is_closed,
    };
  });
}

export async function listCancellationPolicies(hotelId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cancellation_policies")
    .select(
      `id, name_ar, name_en, description_ar, description_en, is_non_refundable,
       cancellation_rules(id, hours_before_checkin, charge_type, charge_value)`,
    )
    .eq("hotel_id", hotelId)
    .order("name_en");

  return (data ?? []).map((p) => ({
    id: p.id,
    nameAr: p.name_ar,
    nameEn: p.name_en,
    descriptionAr: p.description_ar,
    descriptionEn: p.description_en,
    isNonRefundable: p.is_non_refundable,
    rules: (p.cancellation_rules ?? [])
      .map((r) => ({
        id: r.id,
        hoursBeforeCheckin: r.hours_before_checkin,
        chargeType: r.charge_type,
        chargeValue: Number(r.charge_value),
      }))
      .sort((a, b) => b.hoursBeforeCheckin - a.hoursBeforeCheckin),
  }));
}

export async function listChildPolicies(hotelId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("child_policies")
    .select("id, age_from, age_to, charge_type, charge_value")
    .eq("hotel_id", hotelId)
    .order("age_from");

  return (data ?? []).map((c) => ({
    id: c.id,
    ageFrom: c.age_from,
    ageTo: c.age_to,
    chargeType: c.charge_type,
    chargeValue: Number(c.charge_value),
  }));
}

export async function listOffers(hotelId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("offers")
    .select(
      `id, name_ar, name_en, description_ar, description_en, offer_type, discount_type,
       discount_value, booking_window, stay_window, min_nights, free_nights, is_active`,
    )
    .eq("hotel_id", hotelId)
    .order("sort_order")
    .order("name_en");

  return (data ?? []).map((o) => {
    const stay = parseDateRange(o.stay_window as unknown as string);
    const booking = o.booking_window
      ? parseDateRange(o.booking_window as unknown as string)
      : { from: "", to: "" };
    return {
      id: o.id,
      nameAr: o.name_ar,
      nameEn: o.name_en,
      descriptionAr: o.description_ar,
      descriptionEn: o.description_en,
      offerType: o.offer_type,
      discountType: o.discount_type,
      discountValue: Number(o.discount_value),
      stayFrom: stay.from,
      stayTo: stay.to,
      bookingFrom: booking.from,
      bookingTo: booking.to,
      minNights: o.min_nights,
      freeNights: o.free_nights,
      isActive: o.is_active,
    };
  });
}

// -------------------------------------------------------------- allocations

export type AllocationCell = {
  date: string;
  allotment: number;
  sold: number;
  stopSell: boolean;
  minStay: number | null;
};

/** Allocation for one room type across a bounded date window. */
export async function listAllocations(
  roomTypeId: string,
  fromDate: string,
  toDate: string,
): Promise<AllocationCell[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("allocations")
    .select("stay_date, allotment, sold, stop_sell, min_stay")
    .eq("room_type_id", roomTypeId)
    .gte("stay_date", fromDate)
    .lte("stay_date", toDate)
    .order("stay_date");

  return (data ?? []).map((a) => ({
    date: a.stay_date,
    allotment: a.allotment,
    sold: a.sold,
    stopSell: a.stop_sell,
    minStay: a.min_stay,
  }));
}
