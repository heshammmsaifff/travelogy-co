import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import { parseDateRange } from "@/shared/lib/date-range";
import type { Locale } from "@/shared/i18n/config";
import type { Occupancy } from "@/modules/packages/domain/occupancy";

/**
 * Package reads (CLAUDE.md §13, Phase 8c).
 *
 * The split is the one every product module in this project makes (§15, 6.1):
 * the tour, its itinerary and its departures are descriptive and any active
 * user may read them — an agent cannot sell a tour they cannot describe. The
 * CONTRACTED per-person rate has no agent-facing policy at all, and
 * `searchPackages` is the only route to a price, already marked up by the
 * database.
 */

export type PackageStatus = "draft" | "active" | "archived";

export type { Occupancy };

export type PackageSummary = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  summaryAr: string | null;
  summaryEn: string | null;
  countryCode: string;
  cityAr: string;
  cityEn: string;
  durationNights: number;
  coverImagePublicId: string | null;
  status: PackageStatus;
  inclusionsAr: string | null;
  inclusionsEn: string | null;
  exclusionsAr: string | null;
  exclusionsEn: string | null;
};

export type PackageDay = {
  id: string;
  dayNumber: number;
  titleAr: string;
  titleEn: string;
  bodyAr: string | null;
  bodyEn: string | null;
};

export type PackageRate = {
  id: string;
  occupancy: Occupancy;
  netPerPerson: number;
  currencyCode: string;
  validFrom: string;
  /** Inclusive last departure day, as the admin entered it (§15, 6.3). */
  validTo: string;
  isClosed: boolean;
};

export type PackageDeparture = {
  id: string;
  departureDate: string;
  returnDate: string;
  capacity: number;
  seatsSold: number;
  isClosed: boolean;
  notes: string | null;
};

export type PackageOffer = {
  packageId: string;
  packageCode: string;
  name: string;
  summary: string | null;
  city: string;
  countryCode: string;
  durationNights: number;
  coverImage: string | null;
  departureId: string;
  departureDate: string;
  returnDate: string;
  seatsLeft: number;
  currencyCode: string;
  /** Sell price PER PERSON for each occupancy; null where no rate covers it. */
  sell: Record<Occupancy, number | null>;
};

function toSummary(p: {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  summary_ar: string | null;
  summary_en: string | null;
  country_code: string;
  city_ar: string;
  city_en: string;
  duration_nights: number;
  cover_image_public_id: string | null;
  status: string;
  inclusions_ar: string | null;
  inclusions_en: string | null;
  exclusions_ar: string | null;
  exclusions_en: string | null;
}): PackageSummary {
  return {
    id: p.id,
    code: p.code,
    nameAr: p.name_ar,
    nameEn: p.name_en,
    summaryAr: p.summary_ar,
    summaryEn: p.summary_en,
    countryCode: p.country_code,
    cityAr: p.city_ar,
    cityEn: p.city_en,
    durationNights: p.duration_nights,
    coverImagePublicId: p.cover_image_public_id,
    status: p.status as PackageStatus,
    inclusionsAr: p.inclusions_ar,
    inclusionsEn: p.inclusions_en,
    exclusionsAr: p.exclusions_ar,
    exclusionsEn: p.exclusions_en,
  };
}

const PACKAGE_COLUMNS =
  "id, code, name_ar, name_en, summary_ar, summary_en, country_code, city_ar, city_en, duration_nights, cover_image_public_id, status, inclusions_ar, inclusions_en, exclusions_ar, exclusions_en";

export async function listPackages(): Promise<PackageSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select(PACKAGE_COLUMNS)
    .order("status")
    .order("code")
    .limit(300);
  return (data ?? []).map(toSummary);
}

export async function getPackage(id: string): Promise<PackageSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("packages").select(PACKAGE_COLUMNS).eq("id", id).maybeSingle();
  return data ? toSummary(data) : null;
}

export async function listPackageDays(packageId: string): Promise<PackageDay[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("package_days")
    .select("id, day_number, title_ar, title_en, body_ar, body_en")
    .eq("package_id", packageId)
    .order("day_number");

  return (data ?? []).map((d) => ({
    id: d.id,
    dayNumber: d.day_number,
    titleAr: d.title_ar,
    titleEn: d.title_en,
    bodyAr: d.body_ar,
    bodyEn: d.body_en,
  }));
}

/** Contracted rates. Returns nothing for an agent — there is no policy for them. */
export async function listPackageRates(packageId: string): Promise<PackageRate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("package_rates")
    .select("id, occupancy, net_per_person, currency_code, valid_period, is_closed")
    .eq("package_id", packageId)
    .order("occupancy");

  return (data ?? []).map((r) => {
    const { from, to } = parseDateRange(r.valid_period as unknown as string);
    return {
      id: r.id,
      occupancy: r.occupancy as Occupancy,
      netPerPerson: Number(r.net_per_person),
      currencyCode: r.currency_code,
      validFrom: from,
      validTo: to,
      isClosed: r.is_closed,
    };
  });
}

export async function listPackageDepartures(packageId: string): Promise<PackageDeparture[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("package_departures")
    .select("id, departure_date, return_date, capacity, seats_sold, is_closed, notes")
    .eq("package_id", packageId)
    .order("departure_date")
    .limit(500);

  return (data ?? []).map((d) => ({
    id: d.id,
    departureDate: d.departure_date,
    returnDate: d.return_date,
    capacity: d.capacity,
    seatsSold: d.seats_sold,
    isClosed: d.is_closed,
    notes: d.notes,
  }));
}

/** The agent-facing search. Sell prices only; the function applies markup. */
export async function searchPackages(
  criteria: {
    from: string;
    to?: string;
    country?: string;
    city?: string;
    query?: string;
    travellers?: number;
  },
  locale: Locale,
): Promise<PackageOffer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_packages", {
    p_from: criteria.from,
    p_to: criteria.to,
    p_country: criteria.country ?? undefined,
    p_city: criteria.city ?? undefined,
    p_query: criteria.query ?? undefined,
    p_travellers: criteria.travellers ?? 1,
  });

  // A failed search must never render as "no tours available" (§15, 7.6).
  if (error) throw new Error(error.message);

  const ar = locale === "ar";
  return (data ?? []).map((r) => ({
    packageId: r.package_id,
    packageCode: r.package_code,
    name: ar ? r.name_ar : r.name_en,
    summary: (ar ? r.summary_ar : r.summary_en) ?? null,
    city: ar ? r.city_ar : r.city_en,
    countryCode: r.country_code,
    durationNights: r.duration_nights,
    coverImage: r.cover_image,
    departureId: r.departure_id,
    departureDate: r.departure_date,
    returnDate: r.return_date,
    seatsLeft: r.seats_left,
    currencyCode: r.currency_code,
    sell: {
      single: r.sell_single === null ? null : Number(r.sell_single),
      double: r.sell_double === null ? null : Number(r.sell_double),
      triple: r.sell_triple === null ? null : Number(r.sell_triple),
      child: r.sell_child === null ? null : Number(r.sell_child),
    },
  }));
}
