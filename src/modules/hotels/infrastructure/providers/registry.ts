import "server-only";

import { createClient } from "@/shared/lib/supabase/server";
import type {
  AvailabilityQuery,
  HotelSupplierPort,
  SupplierHotelResult,
} from "@/modules/hotels/domain/ports/hotel-supplier.port";
import { InternalInventoryProvider } from "./internal-inventory.provider";
import { SandboxSupplierProvider } from "./external/sandbox.provider";

/**
 * Supplier registry and aggregator (CLAUDE.md §9).
 *
 * Merges results from whichever providers are enabled, so the search UI never
 * needs to know where a result came from. Adding a supplier in Phase 9 means
 * writing one adapter and adding it to EXTERNAL_PROVIDERS — nothing in the
 * search flow changes.
 */

/** Internal inventory is always present and cannot be switched off. */
const internalProvider = new InternalInventoryProvider();

/**
 * External adapters, keyed to their `supplier_integrations.provider_key`.
 * A row with no adapter here is simply never queried.
 */
const EXTERNAL_PROVIDERS: Record<string, HotelSupplierPort> = {
  sandbox: new SandboxSupplierProvider(),
};

export function getProvider(key: string): HotelSupplierPort | null {
  if (key === internalProvider.key) return internalProvider;
  return EXTERNAL_PROVIDERS[key] ?? null;
}

/** Every adapter the code knows about, whether enabled or not. */
export function knownProviderKeys(): string[] {
  return [internalProvider.key, ...Object.keys(EXTERNAL_PROVIDERS)];
}

async function enabledExternalProviders(): Promise<HotelSupplierPort[]> {
  const supabase = await createClient();

  // Read with the service-neutral client: the table is permission-gated, and a
  // plain agent has no read access — so this uses the row set the *caller* can
  // see. For a search that is nothing, which is why the query below runs
  // through an RPC instead.
  const { data } = await supabase.rpc("enabled_supplier_keys");

  return (data ?? [])
    .map((key: string) => EXTERNAL_PROVIDERS[key])
    .filter((p): p is HotelSupplierPort => Boolean(p));
}

export type AggregatedSearch = {
  results: SupplierHotelResult[];
  /** Suppliers that failed, so the UI can say so instead of quietly under-reporting. */
  failures: { supplierKey: string; message: string }[];
};

/**
 * Runs the query against every active provider and merges the results.
 *
 * Providers are queried in parallel and failures are collected rather than
 * thrown: one unreachable external supplier must not take down a search that
 * our own inventory could still answer. The caller is told which ones failed
 * so it can say "showing partial results" rather than silently returning less
 * than exists (§2.3).
 */
export async function searchAllProviders(query: AvailabilityQuery): Promise<AggregatedSearch> {
  const providers = [internalProvider, ...(await enabledExternalProviders())];

  const settled = await Promise.allSettled(
    providers.map(async (provider) => ({
      key: provider.key,
      results: await provider.searchAvailability(query),
    })),
  );

  const results: SupplierHotelResult[] = [];
  const failures: { supplierKey: string; message: string }[] = [];

  for (const [index, outcome] of settled.entries()) {
    const provider = providers[index];
    if (!provider) continue;

    if (outcome.status === "fulfilled") {
      results.push(...outcome.value.results);
    } else {
      const message =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      console.error(`[registry] Supplier ${provider.key} failed:`, message);
      failures.push({ supplierKey: provider.key, message });
    }
  }

  // Cheapest offer first, so the merged list is ordered by what an agent
  // actually compares on rather than by which supplier answered first.
  results.sort((a, b) => {
    const aMin = Math.min(...a.offers.map((o) => o.sellTotal));
    const bMin = Math.min(...b.offers.map((o) => o.sellTotal));
    return aMin - bMin;
  });

  return { results, failures };
}
