import "server-only";

import { createClient, createServiceRoleClient } from "@/shared/lib/supabase/server";
import type {
  AvailabilityQuery,
  HotelSupplierPort,
  SupplierHotelResult,
  SupplierOffer,
  SupplierComparison,
} from "@/modules/hotels/domain/ports/hotel-supplier.port";
import { InternalInventoryProvider } from "./internal-inventory.provider";
import { SandboxSupplierProvider } from "./external/sandbox.provider";

/**
 * Supplier registry, aggregator and deduplication engine (CLAUDE.md §9, Phase 9).
 *
 * Merges results from every provider enabled globally and for the agency,
 * deduplicates the same physical property across suppliers, and ranks by the
 * lowest available rate while keeping supplier-level comparison.
 *
 * ── Which external suppliers are here ────────────────────────────────────────
 * Only adapters that genuinely do what the port promises. Hotelbeds, WebBeds,
 * TBO, itrip, Within Earth and RateHawk have rows in `supplier_integrations`
 * (so credentials can be stored ahead of time) but NO adapter: the Phase 9
 * files that stood in for them generated invented hotels and prices and
 * reported a successful connection without contacting anything (§2.3). The
 * suppliers screen shows them as "no adapter in code" and refuses to enable
 * them. A real adapter is added here when a supplier contract and sandbox
 * credentials exist to build and test it against.
 */

const internalProvider = new InternalInventoryProvider();

const EXTERNAL_PROVIDERS: Record<string, HotelSupplierPort> = {
  sandbox: new SandboxSupplierProvider(),
};

export function getProvider(key: string): HotelSupplierPort | null {
  if (key === internalProvider.key) return internalProvider;
  return EXTERNAL_PROVIDERS[key] ?? null;
}

export function knownProviderKeys(): string[] {
  return [internalProvider.key, ...Object.keys(EXTERNAL_PROVIDERS)];
}

/**
 * Who a search is for.
 *
 * - `session`: the agent portal. The signed-in user's own session decides the
 *   agency, the markup and the supplier preferences — the database ignores
 *   any agency id an agent could supply.
 * - `api`: the B2B API. There is no session; the agency was established by a
 *   verified API key, and the search runs through the service role.
 */
export type SearchContext = { kind: "session" } | { kind: "api"; agencyId: string };

export type AggregatedSearch = {
  results: SupplierHotelResult[];
  failures: { supplierKey: string; message: string }[];
};

type Failure = AggregatedSearch["failures"][number];

async function enabledExternalProviders(
  context: SearchContext,
  failures: Failure[],
): Promise<HotelSupplierPort[]> {
  const { data, error } =
    context.kind === "api"
      ? await createServiceRoleClient().rpc("enabled_supplier_keys_for_agency", {
          p_agency_id: context.agencyId,
        })
      : await (await createClient()).rpc("enabled_supplier_keys_for_agency", {});

  if (error) {
    // Not knowing which suppliers are on is a partial search, not an empty one.
    console.error("[registry] enabled_supplier_keys_for_agency failed:", error.message);
    failures.push({ supplierKey: "registry", message: "Could not resolve enabled suppliers." });
    return [];
  }

  const providers: HotelSupplierPort[] = [];
  for (const key of data ?? []) {
    const provider = EXTERNAL_PROVIDERS[key];
    if (provider) {
      providers.push(provider);
    } else {
      // Enabled in the database with nothing in code to answer for it. Say so
      // rather than quietly searching one supplier fewer than the admin expects.
      failures.push({ supplierKey: key, message: "No adapter is implemented for this supplier." });
    }
  }
  return providers;
}

/** Normalizes text for fallback deduplication when explicit mappings do not exist. */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Runs the query against every active provider, aggregates, deduplicates, and ranks results.
 */
export async function searchAllProviders(
  query: AvailabilityQuery,
  context: SearchContext = { kind: "session" },
): Promise<AggregatedSearch> {
  const failures: Failure[] = [];
  const external = await enabledExternalProviders(context, failures);

  const searches: { key: string; run: () => Promise<SupplierHotelResult[]> }[] = [
    {
      key: internalProvider.key,
      run: () =>
        context.kind === "api"
          ? internalProvider.searchAvailabilityForAgency(query, context.agencyId)
          : internalProvider.searchAvailability(query),
    },
    ...external.map((provider) => ({
      key: provider.key,
      run: () => provider.searchAvailability(query),
    })),
  ];

  const settled = await Promise.allSettled(searches.map((s) => s.run()));

  const rawResults: SupplierHotelResult[] = [];

  for (const [index, outcome] of settled.entries()) {
    const search = searches[index];
    if (!search) continue;

    if (outcome.status === "fulfilled") {
      // Ensure each offer remembers its originating supplier
      for (const hotel of outcome.value) {
        for (const offer of hotel.offers) {
          if (!offer.supplierKey) offer.supplierKey = hotel.supplierKey;
        }
        rawResults.push(hotel);
      }
    } else {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      console.error(`[registry] Supplier ${search.key} failed:`, message);
      failures.push({ supplierKey: search.key, message });
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

  // 1. Mappings for the external properties actually in this result set. Read
  //    with the service role: agents may not read the mapping table (which
  //    supplier holds a property is not theirs to see), but the grouping it
  //    drives is computed here, server-side, and only its effect is returned.
  const externalRefs = rawResults.filter((r) => r.supplierKey !== "internal");
  const mappingMap = new Map<string, string>(); // "supplierKey:hotelRef" -> canonical hotel_id

  if (externalRefs.length > 0) {
    const { data: mappings, error } = await createServiceRoleClient()
      .from("hotel_supplier_mappings")
      .select("hotel_id, supplier_key, supplier_hotel_ref")
      .in(
        "supplier_hotel_ref",
        externalRefs.map((r) => r.hotelRef),
      );

    if (error) {
      // Falls back to name matching below; worth knowing, not worth failing for.
      console.error("[registry] hotel_supplier_mappings read failed:", error.message);
    }

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
      canonicalHotelId:
        mappingMap.get(`${primary.supplierKey}:${primary.hotelRef}`) ??
        (primary.supplierKey === "internal" ? primary.hotelRef : null),
      lowestSupplierKey: supplierComparison[0]?.supplierKey ?? primary.supplierKey,
      supplierComparison,
    });
  }

  return aggregatedResults;
}
