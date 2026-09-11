import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type {
  AvailabilityQuery,
  HotelSupplierPort,
  SupplierHotelResult,
  SupplierOffer,
  SupplierComparison,
} from "@/modules/hotels/domain/ports/hotel-supplier.port";
import { InternalInventoryProvider } from "./internal-inventory.provider";
import { SandboxSupplierProvider } from "./external/sandbox.provider";
import { HotelbedsSupplierProvider } from "./external/hotelbeds.provider";
import { WebbedsSupplierProvider } from "./external/webbeds.provider";
import { TboSupplierProvider } from "./external/tbo.provider";
import { RatehawkSupplierProvider } from "./external/ratehawk.provider";
import { ItripSupplierProvider } from "./external/itrip.provider";
import { WithinEarthSupplierProvider } from "./external/within-earth.provider";

/**
 * Supplier registry, aggregator and deduplication engine (CLAUDE.md §9, Phase 9).
 *
 * Merges results from all active providers enabled globally and for the specific agency.
 * Deduplicates identical hotel properties across multiple suppliers, displaying
 * the lowest available rate by default while retaining supplier-level comparison.
 */

const internalProvider = new InternalInventoryProvider();

const EXTERNAL_PROVIDERS: Record<string, HotelSupplierPort> = {
  sandbox: new SandboxSupplierProvider(),
  hotelbeds: new HotelbedsSupplierProvider(),
  webbeds: new WebbedsSupplierProvider(),
  tbo: new TboSupplierProvider(),
  ratehawk: new RatehawkSupplierProvider(),
  itrip: new ItripSupplierProvider(),
  within_earth: new WithinEarthSupplierProvider(),
};

export function getProvider(key: string): HotelSupplierPort | null {
  if (key === internalProvider.key) return internalProvider;
  return EXTERNAL_PROVIDERS[key] ?? null;
}

export function knownProviderKeys(): string[] {
  return [internalProvider.key, ...Object.keys(EXTERNAL_PROVIDERS)];
}

async function enabledExternalProviders(agencyId?: string): Promise<HotelSupplierPort[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("enabled_supplier_keys_for_agency", {
    p_agency_id: agencyId,
  });

  return (data ?? [])
    .map((key: string) => EXTERNAL_PROVIDERS[key])
    .filter((p): p is HotelSupplierPort => Boolean(p));
}

export type AggregatedSearch = {
  results: SupplierHotelResult[];
  failures: { supplierKey: string; message: string }[];
};

/** Normalizes text for fallback deduplication when explicit mappings do not exist. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Runs the query against every active provider, aggregates, deduplicates, and ranks results.
 */
export async function searchAllProviders(
  query: AvailabilityQuery,
  agencyId?: string,
): Promise<AggregatedSearch> {
  const providers = [internalProvider, ...(await enabledExternalProviders(agencyId))];

  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      key: provider.key,
      results: await provider.searchAvailability(query),
    })),
  );

  const rawResults: SupplierHotelResult[] = [];
  const failures: { supplierKey: string; message: string }[] = [];

  for (const [index, outcome] of settled.entries()) {
    const provider = providers[index];
    if (!provider) continue;

    if (outcome.status === "fulfilled") {
      // Ensure each offer remembers its originating supplier
      for (const hotel of outcome.value.results) {
        for (const offer of hotel.offers) {
          if (!offer.supplierKey) offer.supplierKey = hotel.supplierKey;
        }
        rawResults.push(hotel);
      }
    } else {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      console.error(`[registry] Supplier ${provider.key} failed:`, message);
      failures.push({ supplierKey: provider.key, message });
    }
  }

  // Deduplication Engine (Hotels B2B Hub §6.2)
  const results = await deduplicateAndAggregate(rawResults);

  // Lowest available rate first by default
  results.sort((a, b) => {
    const aMin = Math.min(...a.offers.map((o) => o.sellTotal), Number.POSITIVE_INFINITY);
    const bMin = Math.min(...b.offers.map((o) => o.sellTotal), Number.POSITIVE_INFINITY);
    return aMin - bMin;
  });

  return { results, failures };
}

/**
 * Deduplicates multiple hotel results across suppliers.
 * Groups by explicit hotel_supplier_mappings or normalized name + city.
 */
async function deduplicateAndAggregate(
  rawResults: SupplierHotelResult[],
): Promise<SupplierHotelResult[]> {
  if (rawResults.length <= 1) return rawResults;

  const supabase = await createClient();

  // 1. Fetch any database mappings matching the found hotelRefs
  const supplierRefs = rawResults
    .filter((r) => r.supplierKey !== "internal")
    .map((r) => ({ supplier_key: r.supplierKey, supplier_hotel_ref: r.hotelRef }));

  const mappingMap = new Map<string, string>(); // "supplierKey:hotelRef" -> canonical hotel_id

  if (supplierRefs.length > 0) {
    const { data: mappings } = await supabase
      .from("hotel_supplier_mappings")
      .select("hotel_id, supplier_key, supplier_hotel_ref");

    for (const m of mappings ?? []) {
      mappingMap.set(`${m.supplier_key}:${m.supplier_hotel_ref}`, m.hotel_id);
    }
  }

  // 2. Group hotels into clusters
  const clusters = new Map<string, SupplierHotelResult[]>();

  for (const hotel of rawResults) {
    let groupKey: string;

    const mappedHotelId = mappingMap.get(`${hotel.supplierKey}:${hotel.hotelRef}`);
    if (mappedHotelId) {
      groupKey = `canonical:${mappedHotelId}`;
    } else if (hotel.supplierKey === "internal") {
      groupKey = `canonical:${hotel.hotelRef}`;
    } else {
      // Fallback matching on normalized English or Arabic name + city
      const normCity = normalizeName(hotel.cityEn || hotel.cityAr);
      const normName = normalizeName(hotel.nameEn) || normalizeName(hotel.nameAr);
      groupKey = `name:${normCity}:${normName}`;
    }

    const list = clusters.get(groupKey) ?? [];
    list.push(hotel);
    clusters.set(groupKey, list);
  }

  // 3. Merge each cluster into a single consolidated result
  const aggregatedResults: SupplierHotelResult[] = [];

  for (const [, group] of clusters.entries()) {
    if (group.length === 1 && group[0]) {
      const single = group[0];
      const minPrice = Math.min(...single.offers.map((o) => o.sellTotal));
      single.lowestSupplierKey = single.supplierKey;
      single.supplierComparison = [
        {
          supplierKey: single.supplierKey,
          minPrice,
          currencyCode: single.offers[0]?.currencyCode ?? "SAR",
          offerCount: single.offers.length,
        },
      ];
      aggregatedResults.push(single);
      continue;
    }

    // Prefer internal property details for canonical metadata if present, or best rated
    const primary = group.find((h) => h.supplierKey === "internal") ?? group[0];
    if (!primary) continue;

    const allOffers: SupplierOffer[] = [];
    const comparisonMap = new Map<string, { minPrice: number; currency: string; count: number }>();

    for (const member of group) {
      for (const offer of member.offers) {
        allOffers.push(offer);

        const current = comparisonMap.get(offer.supplierKey ?? member.supplierKey);
        if (!current || offer.sellTotal < current.minPrice) {
          comparisonMap.set(offer.supplierKey ?? member.supplierKey, {
            minPrice: offer.sellTotal,
            currency: offer.currencyCode,
            count: (current?.count ?? 0) + 1,
          });
        } else {
          current.count += 1;
        }
      }
    }

    // Sort combined offers by sell total ascending
    allOffers.sort((a, b) => a.sellTotal - b.sellTotal);

    const supplierComparison: SupplierComparison[] = Array.from(comparisonMap.entries()).map(
      ([key, val]) => ({
        supplierKey: key,
        minPrice: val.minPrice,
        currencyCode: val.currency,
        offerCount: val.count,
      }),
    );
    supplierComparison.sort((a, b) => a.minPrice - b.minPrice);

    aggregatedResults.push({
      ...primary,
      offers: allOffers,
      isAggregated: true,
      canonicalHotelId: mappingMap.get(`${primary.supplierKey}:${primary.hotelRef}`) ?? (primary.supplierKey === "internal" ? primary.hotelRef : null),
      lowestSupplierKey: supplierComparison[0]?.supplierKey ?? primary.supplierKey,
      supplierComparison,
    });
  }

  return aggregatedResults;
}
