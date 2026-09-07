import "server-only";

import type {
  AvailabilityQuery,
  ConnectionTestResult,
  HotelSupplierPort,
  SupplierHotelResult,
} from "@/modules/hotels/domain/ports/hotel-supplier.port";
import { SupplierNotImplementedError } from "@/modules/hotels/domain/ports/hotel-supplier.port";
import { readSupplierCredential } from "@/modules/hotels/infrastructure/supplier-credentials";

/**
 * SANDBOX SUPPLIER — A TEST DOUBLE, NOT A REAL INTEGRATION.
 *
 * CLAUDE.md §9 asks for the adapter interface "proven with one stubbed or
 * sandboxed external example, so the seam exists and is proven, without
 * blocking on a vendor contract". This is that example.
 *
 * What it genuinely proves, end to end:
 *   - an external adapter can satisfy the same port as internal inventory
 *   - credentials entered in the back-office reach an adapter from Vault
 *   - the registry merges results from several suppliers into one list
 *   - a supplier can be enabled, disabled and connection-tested
 *
 * What it does NOT do: contact anything. Its results are generated locally
 * and marked as such. It is disabled by default and named "Sandbox supplier
 * (test)" everywhere it appears, because a fake supplier presented as a real
 * one would be exactly the dishonesty §2.3 prohibits.
 *
 * A real adapter (RateHawk, Hotelbeds) replaces the body of these methods with
 * HTTP calls and response mapping. Nothing outside this file changes.
 */
export class SandboxSupplierProvider implements HotelSupplierPort {
  readonly key = "sandbox";
  readonly isInternal = false;

  /**
   * Credentials are genuinely read from Vault — that part is not simulated,
   * because it is the part worth proving.
   */
  private async requireCredentials(): Promise<{ apiKey: string } | null> {
    const apiKey = await readSupplierCredential(this.key, "api_key");
    if (!apiKey) return null;
    return { apiKey };
  }

  async searchAvailability(query: AvailabilityQuery): Promise<SupplierHotelResult[]> {
    const credentials = await this.requireCredentials();

    // No credentials means the supplier cannot participate. Returning an empty
    // list rather than throwing keeps one misconfigured supplier from taking
    // the whole search down — the registry reports it separately.
    if (!credentials) return [];

    const nights = Math.max(
      1,
      Math.round(
        (Date.parse(`${query.checkOut}T00:00:00Z`) - Date.parse(`${query.checkIn}T00:00:00Z`)) /
          86_400_000,
      ),
    );

    // Deterministic pseudo-inventory, so repeated searches are stable and a
    // demonstration does not shuffle under the user.
    const seed = [...`${query.checkIn}${query.city ?? ""}${query.query ?? ""}`].reduce(
      (acc, ch) => acc + ch.charCodeAt(0),
      0,
    );
    const basePerNight = 900 + (seed % 7) * 150;
    const guests = query.occupancy.adults + query.occupancy.childAges.length;

    const sellPerNight = basePerNight + Math.max(0, guests - 2) * 200;
    const sellTotal = sellPerNight * nights;

    return [
      {
        supplierKey: this.key,
        hotelRef: `sandbox-${(seed % 3) + 1}`,
        // The name says what this is. Anyone seeing it in a result list should
        // immediately understand it is not real inventory.
        nameAr: `فندق تجريبي ${(seed % 3) + 1} (مورد اختبار)`,
        nameEn: `Sandbox Hotel ${(seed % 3) + 1} (test supplier)`,
        cityAr: query.city ?? "القاهرة",
        cityEn: query.city ?? "Cairo",
        countryCode: query.countryCode ?? "EG",
        starRating: 4,
        propertyType: "hotel",
        coverUrl: null,
        offers: [
          {
            offerRef: `sandbox:${seed}:${query.checkIn}:${query.checkOut}`,
            roomRef: "sandbox-room-std",
            ratePlanRef: "sandbox-plan-bb",
            roomNameAr: "غرفة قياسية (تجريبية)",
            roomNameEn: "Standard Room (test)",
            planNameAr: "إفطار (تجريبي)",
            planNameEn: "Bed & Breakfast (test)",
            mealPlanKey: "BB",
            maxOccupancy: 3,
            currencyCode: "EGP",
            nights,
            // Already a sell price: an external supplier quotes net, and a real
            // adapter would apply the same markup resolution before returning.
            sellTotal,
            sellPerNight,
            isRefundable: true,
            roomsAvailable: 5,
          },
        ],
      },
    ];
  }

  async getRatePlans() {
    return [
      {
        ratePlanRef: "sandbox-plan-bb",
        nameAr: "إفطار (تجريبي)",
        nameEn: "Bed & Breakfast (test)",
        mealPlanKey: "BB",
      },
    ];
  }

  async createBooking(): Promise<never> {
    throw new SupplierNotImplementedError(this.key, "createBooking", "Phase 5");
  }

  async cancelBooking(): Promise<never> {
    throw new SupplierNotImplementedError(this.key, "cancelBooking", "Phase 5");
  }

  /**
   * Verifies the credential round trip: back-office -> Vault -> adapter.
   * That is a real check, even though the supplier itself is not.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const credentials = await this.requireCredentials();

    if (!credentials) {
      return {
        ok: false,
        message: "No api_key stored for this supplier. Enter one and test again.",
      };
    }

    return {
      ok: true,
      message: `Credential read from Vault successfully (${credentials.apiKey.length} characters). This is a test supplier; nothing external was contacted.`,
    };
  }
}
