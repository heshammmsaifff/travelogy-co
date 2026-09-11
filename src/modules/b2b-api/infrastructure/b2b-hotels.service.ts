import "server-only";

import { searchAllProviders } from "@/modules/hotels/infrastructure/providers/registry";
import { createServiceRoleClient } from "@/shared/lib/supabase/server";

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

export async function searchB2BHotels(params: B2BSearchParams, agencyId: string) {
  const searchOutput = await searchAllProviders(
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
    agencyId,
  );

  return searchOutput.results.map((hotel) => ({
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
        sellTotal: offer.sellTotal * params.rooms,
        sellPerNight: offer.sellPerNight,
        roomsBooked: params.rooms,
      },
      supplierKey: offer.supplierKey,
    })),
  }));
}

export async function getB2BHotelDetails(hotelIdOrCode: string) {
  const supabase = createServiceRoleClient();

  // Try lookup by id or code
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
      room_types(id, code, name_ar, name_en, max_occupancy, standard_occupancy)
    `,
    )
    .eq("status", "active");

  const { data: hotel, error } = isUuid
    ? await query.eq("id", hotelIdOrCode).maybeSingle()
    : await query.eq("code", hotelIdOrCode.toUpperCase()).maybeSingle();

  if (error || !hotel) {
    return null;
  }

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
        hotel.latitude && hotel.longitude
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
    rooms: (hotel.room_types ?? []).map((r) => ({
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
