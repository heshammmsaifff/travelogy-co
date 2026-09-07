import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type {
  AvailabilityQuery,
  ConnectionTestResult,
  HotelSupplierPort,
  SupplierHotelResult,
  SupplierOffer,
} from "@/modules/hotels/domain/ports/hotel-supplier.port";
import { SupplierNotImplementedError } from "@/modules/hotels/domain/ports/hotel-supplier.port";

/**
 * Our own contracted inventory, behind the supplier port (CLAUDE.md §9).
 *
 * All the work happens in `search_availability()` in Postgres: it joins rates,
 * allocation and room types, checks that every night of the stay is both
 * priced and available, resolves the markup, and returns SELL prices. Nothing
 * here ever sees a net rate — which is precisely why agents need no read
 * access to the rate tables (§15, decision 6.1).
 *
 * The RPC runs on the caller's session, so it resolves the markup for *their*
 * agency and refuses if their account is not active.
 */
export class InternalInventoryProvider implements HotelSupplierPort {
  readonly key = "internal";
  readonly isInternal = true;

  async searchAvailability(query: AvailabilityQuery): Promise<SupplierHotelResult[]> {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("search_availability", {
      p_check_in: query.checkIn,
      p_check_out: query.checkOut,
      p_adults: query.occupancy.adults,
      p_children: query.occupancy.childAges.length,
      p_rooms: query.rooms,
      // The generated RPC signature types these optional params as
      // `string | undefined`, so an explicit null is not accepted — omitting
      // them lets the function's own DEFAULT NULL apply.
      p_country: query.countryCode,
      p_city: query.city,
      p_query: query.query,
    });

    if (error) {
      // A failed search must not look like an empty one — the caller decides
      // how to report it, but it has to know the difference.
      throw new Error(error.message);
    }

    // The RPC returns one flat row per offer. Group them back into properties
    // so the UI renders a hotel with its rooms rather than a list of rooms.
    const byHotel = new Map<string, SupplierHotelResult>();

    for (const row of data ?? []) {
      let hotel = byHotel.get(row.hotel_id);

      if (!hotel) {
        hotel = {
          supplierKey: this.key,
          hotelRef: row.hotel_id,
          nameAr: row.name_ar,
          nameEn: row.name_en,
          cityAr: row.city_ar,
          cityEn: row.city_en,
          countryCode: row.country_code,
          starRating: row.star_rating,
          propertyType: row.property_type,
          coverUrl: row.cover_url,
          offers: [],
        };
        byHotel.set(row.hotel_id, hotel);
      }

      const offer: SupplierOffer = {
        // Enough to identify the exact offer when Phase 5 books it.
        offerRef: `${row.room_type_id}:${row.rate_plan_id}:${query.checkIn}:${query.checkOut}`,
        roomRef: row.room_type_id,
        ratePlanRef: row.rate_plan_id,
        roomNameAr: row.room_name_ar,
        roomNameEn: row.room_name_en,
        planNameAr: row.plan_name_ar,
        planNameEn: row.plan_name_en,
        mealPlanKey: row.meal_plan_key,
        maxOccupancy: row.max_occupancy,
        currencyCode: row.currency_code,
        nights: row.nights,
        sellTotal: Number(row.sell_total),
        sellPerNight: Number(row.sell_per_night),
        isRefundable: row.is_refundable,
        roomsAvailable: row.rooms_available,
      };

      hotel.offers.push(offer);
    }

    return [...byHotel.values()];
  }

  async getRatePlans(hotelRef: string) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("rate_plans")
      .select("id, name_ar, name_en, meal_plan_key")
      .eq("hotel_id", hotelRef)
      .eq("status", "active");

    return (data ?? []).map((p) => ({
      ratePlanRef: p.id,
      nameAr: p.name_ar,
      nameEn: p.name_en,
      mealPlanKey: p.meal_plan_key,
    }));
  }

  async createBooking(): Promise<never> {
    throw new SupplierNotImplementedError(this.key, "createBooking", "Phase 5");
  }

  async cancelBooking(): Promise<never> {
    throw new SupplierNotImplementedError(this.key, "cancelBooking", "Phase 5");
  }

  async testConnection(): Promise<ConnectionTestResult> {
    // "Connecting" to our own database means checking there is sellable stock.
    const supabase = await createClient();
    const { count, error } = await supabase
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if (error) return { ok: false, message: error.message };

    return {
      ok: true,
      message: `Internal inventory reachable — ${count ?? 0} published hotels.`,
    };
  }
}
