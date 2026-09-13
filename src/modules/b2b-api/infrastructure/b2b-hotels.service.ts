import "server-only";

import { searchAllProviders } from "@/modules/hotels/infrastructure/providers/registry";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";
import { B2BApiError } from "./b2b-bookings.service";

export type B2BSearchParams = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  city?: string;
  countryCode?: string;
  query?: string;
};

/**
 * Searches on behalf of the agency that owns the API key.
 *
 * Runs in the registry's `api` context: prices carry THAT agency's markup and
 * only suppliers enabled for it take part. Supplier failures are reported as
 * partial results rather than dropped, because a buyer system that receives
 * fewer hotels than exist cannot tell that apart from "sold out" (§15, 7.6).
 */
export async function searchB2BHotels(params: B2BSearchParams, agencyId: string) {
  const { results, failures } = await searchAllProviders(
    {
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      occupancy: {
        adults: params.adults,
        childAges: Array.from({ length: params.children }, () => 8),
      },
      rooms: params.rooms,
      city: params.city,
      countryCode: params.countryCode,
      query: params.query,
    },
    { kind: "api", agencyId },
  );

  // Our own inventory failing with nothing else answering is an outage, not an
  // empty result set.
  if (results.length === 0 && failures.some((f) => f.supplierKey === "internal")) {
    throw new B2BApiError("SEARCH_FAILED", 500, "Hotel search failed. Please retry.");
  }

  const hotels = results.map((hotel) => ({
    id: hotel.canonicalHotelId ?? hotel.hotelRef,
    code: hotel.hotelRef,
    name: {
      ar: hotel.nameAr,
      en: hotel.nameEn,
    },
    city: {
      ar: hotel.cityAr,
      en: hotel.cityEn,
    },
    countryCode: hotel.countryCode,
    starRating: hotel.starRating,
    coverUrl: hotel.coverUrl,
    supplier: {
      key: hotel.lowestSupplierKey ?? hotel.supplierKey,
      multiSupplierAvailable: (hotel.supplierComparison?.length ?? 1) > 1,
      totalSuppliers: hotel.supplierComparison?.length ?? 1,
    },
    offers: hotel.offers.map((offer) => ({
      roomTypeId: offer.roomRef,
      ratePlanId: offer.ratePlanRef,
      offerId: offer.offerRef,
      // Only our own inventory can be booked through POST /bookings today;
      // an external offer's ids are the supplier's, not ours.
      bookable: (offer.supplierKey ?? hotel.supplierKey) === "internal",
      roomName: {
        ar: offer.roomNameAr,
        en: offer.roomNameEn,
      },
      ratePlanName: {
        ar: offer.planNameAr,
        en: offer.planNameEn,
      },
      mealPlan: offer.mealPlanKey,
      isRefundable: offer.isRefundable,
      roomsAvailable: offer.roomsAvailable,
      nights: offer.nights,
      pricing: {
        currency: offer.currencyCode,
        // The port prices ONE room; the buyer asked for `rooms` of them. Tax
        // and any promo code are applied at booking, so the booking total can
        // differ from this figure — documented in the OpenAPI spec.
        sellTotal: Math.round(offer.sellTotal * params.rooms * 100) / 100,
        sellPerNight: offer.sellPerNight,
        roomsBooked: params.rooms,
      },
      supplierKey: offer.supplierKey,
    })),
  }));

  return {
    hotels,
    unavailableSuppliers: failures.map((f) => f.supplierKey),
  };
}

export async function getB2BHotelDetails(hotelIdOrCode: string) {
  const supabase = createServiceRoleClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    hotelIdOrCode,
  );

  const query = supabase
    .from("hotels")
    .select(
      `
      id, code, name_ar, name_en, star_rating, property_type,
      city_ar, city_en, country_code, address_ar, address_en,
      latitude, longitude, description_ar, description_en,
      check_in_time, check_out_time,
      hotel_images(id, secure_url, sort_order, is_cover, alt_ar, alt_en),
      room_types(id, code, name_ar, name_en, max_occupancy, standard_occupancy, status)
    `,
    )
    .eq("status", "active");

  const { data: hotel, error } = isUuid
    ? await query.eq("id", hotelIdOrCode).maybeSingle()
    : await query.eq("code", hotelIdOrCode.toUpperCase()).maybeSingle();

  if (error) {
    console.error("[b2b-api] hotel read failed:", error.message);
    throw new B2BApiError("FETCH_FAILED", 500, "Hotel details could not be retrieved.");
  }
  if (!hotel) return null;

  return {
    id: hotel.id,
    code: hotel.code,
    name: {
      ar: hotel.name_ar,
      en: hotel.name_en,
    },
    starRating: hotel.star_rating,
    propertyType: hotel.property_type,
    location: {
      city: {
        ar: hotel.city_ar,
        en: hotel.city_en,
      },
      countryCode: hotel.country_code,
      address: {
        ar: hotel.address_ar,
        en: hotel.address_en,
      },
      coordinates:
        hotel.latitude !== null && hotel.longitude !== null
          ? {
              latitude: Number(hotel.latitude),
              longitude: Number(hotel.longitude),
            }
          : null,
    },
    policies: {
      checkInTime: hotel.check_in_time,
      checkOutTime: hotel.check_out_time,
    },
    description: {
      ar: hotel.description_ar,
      en: hotel.description_en,
    },
    images: (hotel.hotel_images ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => ({
        id: img.id,
        url: img.secure_url,
        isCover: img.is_cover,
        alt: {
          ar: img.alt_ar,
          en: img.alt_en,
        },
      })),
    // An inactive room type is not something a buyer can be offered.
    rooms: (hotel.room_types ?? [])
      .filter((r) => r.status === "active")
      .map((r) => ({
        id: r.id,
        code: r.code,
        name: {
          ar: r.name_ar,
          en: r.name_en,
        },
        baseOccupancy: r.standard_occupancy,
        maxOccupancy: r.max_occupancy,
      })),
  };
}
