/**
 * The hotel supplier port (CLAUDE.md §9).
 *
 * Every source of hotel inventory — our own contracted stock and any external
 * supplier — is reached through this one interface, and every one returns the
 * same shapes. That is what lets the search flow in 3c stay ignorant of where
 * a result came from, and what lets a new supplier be added in Phase 9 without
 * the booking flow changing.
 *
 * No framework imports: this file describes the contract in business terms
 * only, so `domain/` stays free of Supabase, Next and React (§6).
 */

// ---------------------------------------------------------------- requests

export type OccupancyRequest = {
  adults: number;
  /** Ages of accompanying children; length is the child count. */
  childAges: number[];
};

export type AvailabilityQuery = {
  /** Inclusive first night, ISO date. */
  checkIn: string;
  /** Departure morning, ISO date. Not itself a night. */
  checkOut: string;
  occupancy: OccupancyRequest;
  /** How many rooms of the same configuration. */
  rooms: number;
  countryCode?: string;
  city?: string;
  /** Free text against hotel or city name. */
  query?: string;
};

// ----------------------------------------------------------------- results

/**
 * One bookable offer.
 *
 * Prices here are ALWAYS sell prices — what the agent pays. No implementation
 * may put a net contract rate in this shape; the margin is resolved before a
 * result is built (§15, decision 6.1).
 */
export type SupplierOffer = {
  /** Stable within the supplier; how a later booking call refers back to it. */
  offerRef: string;
  roomRef: string;
  ratePlanRef: string;

  roomNameAr: string;
  roomNameEn: string;
  planNameAr: string;
  planNameEn: string;

  mealPlanKey: string;
  maxOccupancy: number;

  currencyCode: string;
  nights: number;
  /**
   * PER ROOM for the whole stay — not the booking total. A request for three
   * rooms returns one offer priced for one of them; the caller multiplies.
   * Every adapter must follow this, because the booking path does.
   */
  sellTotal: number;
  /** Per room, per night. */
  sellPerNight: number;

  isRefundable: boolean;
  roomsAvailable: number;
  /** Which supplier provided this offer (defaults to hotel result supplierKey). */
  supplierKey?: string;
};

export type SupplierComparison = {
  supplierKey: string;
  minPrice: number;
  currencyCode: string;
  offerCount: number;
};

export type SupplierHotelResult = {
  /** Which adapter produced this, so the UI can label a non-internal result. */
  supplierKey: string;
  /** The supplier's own identifier for the property. */
  hotelRef: string;

  nameAr: string;
  nameEn: string;
  cityAr: string;
  cityEn: string;
  countryCode: string;
  starRating: number | null;
  propertyType: string;
  coverUrl: string | null;

  offers: SupplierOffer[];

  /** Multi-supplier deduplication & rate comparison (Hotels B2B Hub §6.2) */
  canonicalHotelId?: string | null;
  isAggregated?: boolean;
  supplierComparison?: SupplierComparison[];
  lowestSupplierKey?: string;
};

export type ConnectionTestResult = {
  ok: boolean;
  /** Shown to the admin verbatim, so it must be written for a human. */
  message: string;
};

// ------------------------------------------------------------------- errors

/**
 * Thrown by port methods that exist so the seam is complete but whose
 * behaviour belongs to a later phase. Deliberately loud: a caller must not be
 * able to mistake it for "no availability" (§2.3).
 */
export class SupplierNotImplementedError extends Error {
  constructor(supplierKey: string, method: string, arrivesIn: string) {
    super(`${supplierKey}.${method}() is not implemented yet — it arrives in ${arrivesIn}.`);
    this.name = "SupplierNotImplementedError";
  }
}

export class SupplierUnavailableError extends Error {
  constructor(supplierKey: string, reason: string) {
    super(`Supplier ${supplierKey} is unavailable: ${reason}`);
    this.name = "SupplierUnavailableError";
  }
}

// -------------------------------------------------------------------- port

export interface HotelSupplierPort {
  /** Matches `supplier_integrations.provider_key` for external suppliers. */
  readonly key: string;

  /** True for our own contracted inventory, false for anything external. */
  readonly isInternal: boolean;

  searchAvailability(query: AvailabilityQuery): Promise<SupplierHotelResult[]>;

  /** Rate plans for one property, for a detail view. */
  getRatePlans(
    hotelRef: string,
  ): Promise<{ ratePlanRef: string; nameAr: string; nameEn: string; mealPlanKey: string }[]>;

  /**
   * Phase 5 owns the booking state machine; these exist now so the interface
   * is whole and no later phase has to reshape it. Implementations throw
   * SupplierNotImplementedError rather than pretending to succeed.
   */
  createBooking(offerRef: string, payload: unknown): Promise<never>;
  cancelBooking(bookingRef: string): Promise<never>;

  /** Lets an admin verify entered credentials before enabling a supplier. */
  testConnection(): Promise<ConnectionTestResult>;
}
