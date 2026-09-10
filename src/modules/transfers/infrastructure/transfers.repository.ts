import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import { parseDateRange } from "@/shared/lib/date-range";

/**
 * Transfer reads (CLAUDE.md §13, Phase 8a).
 *
 * The split here is the same one the hotel module makes, for the same reason
 * (§15, 6.1): vehicles and routes are descriptive and any active user may read
 * them, but `transfer_rates` are contracted NET prices and no agent has a
 * SELECT policy on that table at all. `searchTransfers` is the agent's only
 * route to a price, and it returns sell figures the database has already
 * marked up — the net never leaves Postgres (§15, 7.3).
 */

export type VehicleType = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  maxPassengers: number;
  maxLuggage: number;
  descriptionAr: string | null;
  descriptionEn: string | null;
  isActive: boolean;
};

export type TransferDirection = "arrival" | "departure" | "point_to_point";

export type TransferRoute = {
  id: string;
  code: string;
  countryCode: string;
  cityAr: string;
  cityEn: string;
  fromNameAr: string;
  fromNameEn: string;
  toNameAr: string;
  toNameEn: string;
  direction: TransferDirection;
  durationMinutes: number | null;
  distanceKm: number | null;
  isActive: boolean;
};

export type TransferRate = {
  id: string;
  routeId: string;
  vehicleTypeId: string;
  pricePerVehicle: number;
  currencyCode: string;
  validFrom: string;
  /** Inclusive last day, as the admin entered it (§15, 6.3). */
  validTo: string;
  isClosed: boolean;
};

export type TransferOffer = {
  routeId: string;
  routeCode: string;
  fromName: string;
  toName: string;
  city: string | null;
  countryCode: string;
  direction: TransferDirection;
  durationMinutes: number | null;
  vehicleTypeId: string;
  vehicleName: string;
  maxPassengers: number;
  maxLuggage: number;
  currencyCode: string;
  /** Sell price for ONE vehicle. N vehicles cost N times this (§15, Phase 7). */
  sellPerVehicle: number;
};

export async function listVehicleTypes(): Promise<VehicleType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vehicle_types")
    .select(
      "id, code, name_ar, name_en, max_passengers, max_luggage, description_ar, description_en, is_active",
    )
    .order("max_passengers")
    .limit(200);

  return (data ?? []).map((v) => ({
    id: v.id,
    code: v.code,
    nameAr: v.name_ar,
    nameEn: v.name_en,
    maxPassengers: v.max_passengers,
    maxLuggage: v.max_luggage,
    descriptionAr: v.description_ar,
    descriptionEn: v.description_en,
    isActive: v.is_active,
  }));
}

export async function listTransferRoutes(): Promise<TransferRoute[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transfer_routes")
    .select(
      "id, code, country_code, city_ar, city_en, from_name_ar, from_name_en, to_name_ar, to_name_en, direction, duration_minutes, distance_km, is_active",
    )
    .order("city_en")
    .order("code")
    .limit(500);

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    countryCode: r.country_code,
    cityAr: r.city_ar,
    cityEn: r.city_en,
    fromNameAr: r.from_name_ar,
    fromNameEn: r.from_name_en,
    toNameAr: r.to_name_ar,
    toNameEn: r.to_name_en,
    direction: r.direction as TransferDirection,
    durationMinutes: r.duration_minutes,
    distanceKm: r.distance_km,
    isActive: r.is_active,
  }));
}

/**
 * Contracted rates. Returns nothing at all for an agent — there is no SELECT
 * policy on this table, which is what keeps the margin out of reach rather
 * than a filter written here.
 */
export async function listTransferRates(): Promise<TransferRate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transfer_rates")
    .select("id, route_id, vehicle_type_id, price_per_vehicle, currency_code, valid_period, is_closed")
    .order("valid_period")
    .limit(1000);

  return (data ?? []).map((r) => {
    const { from, to } = parseDateRange(r.valid_period as unknown as string);
    return {
      id: r.id,
      routeId: r.route_id,
      vehicleTypeId: r.vehicle_type_id,
      pricePerVehicle: Number(r.price_per_vehicle),
      currencyCode: r.currency_code,
      validFrom: from,
      validTo: to,
      isClosed: r.is_closed,
    };
  });
}

/** The agent-facing search. Sell prices only; the function applies markup. */
export async function searchTransfers(
  criteria: { date: string; passengers: number; country?: string; city?: string; query?: string },
  locale: "ar" | "en",
): Promise<TransferOffer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_transfers", {
    p_date: criteria.date,
    p_passengers: criteria.passengers,
    p_country: criteria.country ?? undefined,
    p_city: criteria.city ?? undefined,
    p_query: criteria.query ?? undefined,
  });

  // The function raises for a caller who may not search at all. Letting that
  // reach the page as an exception is deliberate — a failed search must never
  // render as "no transfers available" (§15, 7.6).
  if (error) throw new Error(error.message);

  const ar = locale === "ar";
  return (data ?? []).map((r) => ({
    routeId: r.route_id,
    routeCode: r.route_code,
    fromName: ar ? r.from_name_ar : r.from_name_en,
    toName: ar ? r.to_name_ar : r.to_name_en,
    city: (ar ? r.city_ar : r.city_en) ?? null,
    countryCode: r.country_code,
    direction: r.direction as TransferDirection,
    durationMinutes: r.duration_minutes,
    vehicleTypeId: r.vehicle_type_id,
    vehicleName: ar ? r.vehicle_name_ar : r.vehicle_name_en,
    maxPassengers: r.max_passengers,
    maxLuggage: r.max_luggage,
    currencyCode: r.currency_code,
    sellPerVehicle: Number(r.sell_per_vehicle),
  }));
}
